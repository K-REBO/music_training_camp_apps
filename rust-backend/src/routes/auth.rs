/// POST /reservation/api/auth/login
/// POST /reservation/api/auth/logout
/// GET  /reservation/api/auth/me

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::Deserialize;
use sqlx::SqlitePool;
use std::env;

use crate::db;
use crate::extractors::OptionalUser;
use crate::types::ApiResponse;

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
}

#[derive(Deserialize)]
struct LoginBody {
    name: String,
    grade: String,
    password: Option<String>,
}

async fn login(
    State(pool): State<SqlitePool>,
    jar: CookieJar,
    Json(body): Json<LoginBody>,
) -> Result<(CookieJar, Json<serde_json::Value>), (StatusCode, Json<serde_json::Value>)> {
    let name = body.name.trim().to_string();
    let grade = body.grade.trim().to_string();

    if name.is_empty() || grade.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "名前と学年は必須です" })),
        ));
    }

    // 椎木知仁の場合はパスワード認証
    if name == "椎木知仁" {
        let admin_password = env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "admin123".to_string());
        match body.password.as_deref() {
            None | Some("") => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "success": false, "error": "パスワードが必要です" })),
                ));
            }
            Some(pw) if pw != admin_password => {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    Json(
                        serde_json::json!({ "success": false, "error": "パスワードが正しくありません" }),
                    ),
                ));
            }
            _ => {}
        }
    }

    // メンバー検証
    let member = db::get_member_by_name_and_grade(&pool, &name, &grade)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "success": false, "error": "サーバーエラーが発生しました" })),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({
                    "success": false,
                    "error": "登録されていないメンバーです。名前と学年を確認してください。"
                })),
            )
        })?;

    // セッション作成
    let session = db::create_session(&pool, &member.id, &member.name, &member.grade)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "success": false, "error": "セッション作成失敗" })),
            )
        })?;

    let cookie = Cookie::build(("session_id", session.id))
        .http_only(true)
        .same_site(SameSite::Strict)
        .max_age(time::Duration::hours(24))
        .path("/reservation")
        .build();

    let jar = jar.add(cookie);

    Ok((
        jar,
        Json(serde_json::json!({
            "success": true,
            "data": {
                "user": {
                    "id": member.id,
                    "name": member.name,
                    "grade": member.grade
                }
            }
        })),
    ))
}

async fn logout(
    State(pool): State<SqlitePool>,
    OptionalUser(user): OptionalUser,
    jar: CookieJar,
) -> (CookieJar, Json<serde_json::Value>) {
    if let Some(session) = user {
        let _ = db::delete_session(&pool, &session.id).await;
    }

    let jar = jar.remove(Cookie::build(("session_id", "")).path("/reservation").build());

    (
        jar,
        Json(serde_json::json!({ "success": true })),
    )
}

async fn me(
    State(pool): State<SqlitePool>,
    OptionalUser(user): OptionalUser,
) -> Json<serde_json::Value> {
    match user {
        None => Json(serde_json::json!({ "success": false, "error": "未認証" })),
        Some(session) => {
            let is_admin = db::is_admin(&pool, &session.user_id, &session.user_name)
                .await
                .unwrap_or(false);
            Json(serde_json::json!({
                "success": true,
                "data": {
                    "id": session.user_id,
                    "name": session.user_name,
                    "grade": session.grade,
                    "isAdmin": is_admin
                }
            }))
        }
    }
}
