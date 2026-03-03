/// POST /reservation/api/line/webhook  (LINE 署名検証)
/// GET  /reservation/api/line/pending  (admin)
/// DELETE /reservation/api/line/pending?userId=... (admin)

use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    routing::{delete, get, post},
    Router,
};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;
use sqlx::SqlitePool;
use std::env;

use crate::db;
use crate::extractors::AdminUser;

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/api/line/webhook", post(webhook))
        .route(
            "/api/line/pending",
            get(get_pending).delete(delete_pending),
        )
}

async fn webhook(
    State(pool): State<SqlitePool>,
    headers: HeaderMap,
    body: Bytes,
) -> (StatusCode, Json<serde_json::Value>) {
    let channel_secret = env::var("LINE_CHANNEL_SECRET").unwrap_or_default();
    if !channel_secret.is_empty() {
        let signature = headers
            .get("x-line-signature")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        if !verify_line_signature(&body, signature, &channel_secret) {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({})),
            );
        }
    }

    let Ok(body_json) = serde_json::from_slice::<serde_json::Value>(&body) else {
        return (StatusCode::OK, Json(serde_json::json!({ "success": true })));
    };

    let Some(events) = body_json.get("events").and_then(|e| e.as_array()) else {
        return (StatusCode::OK, Json(serde_json::json!({ "success": true })));
    };

    let access_token = env::var("LINE_CHANNEL_ACCESS_TOKEN").unwrap_or_default();

    for event in events {
        let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if !["follow", "message"].contains(&event_type) {
            continue;
        }
        let Some(line_user_id) = event
            .get("source")
            .and_then(|s| s.get("userId"))
            .and_then(|u| u.as_str())
        else {
            continue;
        };

        // プロフィール取得
        if access_token.is_empty() {
            continue;
        }
        let profile_url = format!("https://api.line.me/v2/bot/profile/{}", line_user_id);
        let client = reqwest::Client::new();
        if let Ok(resp) = client
            .get(&profile_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
        {
            if let Ok(profile) = resp.json::<serde_json::Value>().await {
                let display_name = profile
                    .get("displayName")
                    .and_then(|n| n.as_str())
                    .unwrap_or("unknown");
                let _ = db::set_line_pending(&pool, line_user_id, display_name).await;
            }
        }
    }

    (StatusCode::OK, Json(serde_json::json!({ "success": true })))
}

async fn get_pending(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let pending = db::get_line_pending_all(&pool).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;
    Ok(Json(serde_json::json!({ "success": true, "data": pending })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeletePendingQuery {
    user_id: Option<String>,
}

async fn delete_pending(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Query(q): Query<DeletePendingQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = q.user_id.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "userIdが必要です" })),
        )
    })?;

    db::delete_line_pending(&pool, &user_id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true })))
}

fn verify_line_signature(body: &[u8], signature: &str, channel_secret: &str) -> bool {
    type HmacSha256 = Hmac<Sha256>;
    let Ok(mut mac) = HmacSha256::new_from_slice(channel_secret.as_bytes()) else {
        return false;
    };
    mac.update(body);
    let result = mac.finalize().into_bytes();
    let expected = hex::encode(result);
    // base64 デコードして比較
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(signature)
        .unwrap_or_default();
    hex::encode(decoded) == expected
}
