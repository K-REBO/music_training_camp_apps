/// GET    /reservation/api/members
/// POST   /reservation/api/members
/// PUT    /reservation/api/members/:id
/// DELETE /reservation/api/members/:id

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post, put},
    Router,
};
use serde::Deserialize;
use sqlx::SqlitePool;

use crate::db;
use crate::extractors::AdminUser;

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/api/members", get(list_members).post(create_member))
        .route(
            "/api/members/:id",
            put(update_member).delete(delete_member),
        )
}

async fn list_members(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let members = db::get_members(&pool).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;
    Ok(Json(serde_json::json!({ "success": true, "data": members })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMemberBody {
    name: String,
    grade: String,
    #[serde(default)]
    line_user_id: Option<String>,
}

async fn create_member(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Json(body): Json<CreateMemberBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<serde_json::Value>)> {
    let name = body.name.trim().to_string();
    let grade = body.grade.trim().to_string();
    if name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "名前は必須です" })),
        ));
    }
    if grade.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "学年は必須です" })),
        ));
    }

    if db::get_member_by_name_and_grade(&pool, &name, &grade)
        .await
        .unwrap_or(None)
        .is_some()
    {
        return Err((
            StatusCode::CONFLICT,
            Json(
                serde_json::json!({ "success": false, "error": "同名・同学年のメンバーが既に存在します" }),
            ),
        ));
    }

    let member = db::create_member(&pool, name, grade, body.line_user_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "success": false, "error": e.to_string() })),
            )
        })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "success": true, "data": member })),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateMemberBody {
    name: Option<String>,
    grade: Option<String>,
    line_user_id: Option<serde_json::Value>, // null (clear) or string or absent
    version: Option<i64>,
}

async fn update_member(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateMemberBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let current = db::get_member(&pool, &id).await.unwrap_or(None).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "success": false, "error": "メンバーが見つかりません" })),
        )
    })?;

    let new_name = body
        .name
        .as_deref()
        .map(str::trim)
        .map(str::to_string)
        .unwrap_or_else(|| current.name.clone());
    let new_grade = body
        .grade
        .as_deref()
        .map(str::trim)
        .map(str::to_string)
        .unwrap_or_else(|| current.grade.clone());

    // line_user_id: null → clear, string → set, absent → keep
    let new_line_user_id: Option<Option<String>> = match body.line_user_id {
        Some(serde_json::Value::Null) => Some(None),
        Some(serde_json::Value::String(s)) => {
            let trimmed = s.trim().to_string();
            Some(if trimmed.is_empty() { None } else { Some(trimmed) })
        }
        Some(_) => None, // 不正な型は無視
        None => None,    // absent → keep current
    };

    // 名前・学年変更時の重複チェック
    if new_name != current.name || new_grade != current.grade {
        let existing = db::get_member_by_name_and_grade(&pool, &new_name, &new_grade)
            .await
            .unwrap_or(None);
        if let Some(ex) = existing {
            if ex.id != id {
                return Err((
                    StatusCode::CONFLICT,
                    Json(
                        serde_json::json!({ "success": false, "error": "同名・同学年のメンバーが既に存在します" }),
                    ),
                ));
            }
        }
    }

    let updated =
        db::update_member(&pool, &id, Some(new_name), Some(new_grade), new_line_user_id, body.version)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "success": false, "error": e.to_string() })),
                )
            })?;

    Ok(Json(serde_json::json!({ "success": true, "data": updated })))
}

async fn delete_member(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if db::get_member(&pool, &id).await.unwrap_or(None).is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "success": false, "error": "メンバーが見つかりません" })),
        ));
    }

    db::delete_member(&pool, &id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true })))
}
