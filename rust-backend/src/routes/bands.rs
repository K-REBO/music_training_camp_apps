/// GET    /reservation/api/bands
/// POST   /reservation/api/bands
/// PUT    /reservation/api/bands/:id
/// DELETE /reservation/api/bands/:id

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post, put},
    Router,
};
use serde::Deserialize;
use sqlx::SqlitePool;
use std::collections::HashMap;

use crate::db;
use crate::extractors::AdminUser;
use crate::types::ApiResponse;

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/api/bands", get(list_bands).post(create_band))
        .route(
            "/api/bands/:id",
            put(update_band).delete(delete_band),
        )
}

async fn list_bands(State(pool): State<SqlitePool>) -> Json<serde_json::Value> {
    match db::get_bands(&pool).await {
        Ok(bands) => Json(serde_json::json!({ "success": true, "data": bands })),
        Err(e) => Json(
            serde_json::json!({ "success": false, "error": format!("バンド取得失敗: {}", e) }),
        ),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateBandBody {
    name: String,
    #[serde(default)]
    members: HashMap<String, String>,
    #[serde(default)]
    member_ids: Vec<String>,
}

async fn create_band(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Json(body): Json<CreateBandBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<serde_json::Value>)> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "バンド名は必須です" })),
        ));
    }

    if db::get_band_by_name(&pool, &name).await.unwrap_or(None).is_some() {
        return Err((
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "success": false, "error": "同名のバンドが既に存在します" })),
        ));
    }

    let band = db::create_band(&pool, name, body.members, body.member_ids)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "success": false, "error": e.to_string() })),
            )
        })?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "success": true, "data": band }))))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateBandBody {
    name: Option<String>,
    members: Option<HashMap<String, String>>,
    member_ids: Option<Vec<String>>,
    version: Option<i64>,
}

async fn update_band(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateBandBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if db::get_band(&pool, &id).await.unwrap_or(None).is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "success": false, "error": "バンドが見つかりません" })),
        ));
    }

    // 名前変更時の重複チェック
    if let Some(ref new_name) = body.name {
        let new_name = new_name.trim().to_string();
        let existing = db::get_band_by_name(&pool, &new_name).await.unwrap_or(None);
        if let Some(existing_band) = existing {
            if existing_band.id != id {
                return Err((
                    StatusCode::CONFLICT,
                    Json(
                        serde_json::json!({ "success": false, "error": "同名のバンドが既に存在します" }),
                    ),
                ));
            }
        }
    }

    let updated = db::update_band(
        &pool,
        &id,
        body.name.map(|n| n.trim().to_string()),
        body.members,
        body.member_ids,
        body.version,
    )
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true, "data": updated })))
}

async fn delete_band(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if db::get_band(&pool, &id).await.unwrap_or(None).is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "success": false, "error": "バンドが見つかりません" })),
        ));
    }

    db::delete_band(&pool, &id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true })))
}
