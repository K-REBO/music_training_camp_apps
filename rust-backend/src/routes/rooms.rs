/// GET    /reservation/api/rooms
/// POST   /reservation/api/rooms         (admin: スタジオ追加)
/// PUT    /reservation/api/rooms/:id     (admin: 名前変更)
/// DELETE /reservation/api/rooms/:id    (admin: 最後のスタジオを削除)

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
        .route("/api/rooms", get(list_rooms).post(add_room))
        .route("/api/rooms/:id", put(rename_room).delete(delete_room))
}

async fn list_rooms(State(pool): State<SqlitePool>) -> Json<serde_json::Value> {
    match db::get_rooms_config(&pool).await {
        Ok(config) => {
            let rooms = db::build_rooms(&config);
            Json(serde_json::json!({ "success": true, "data": rooms }))
        }
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

#[derive(Deserialize)]
struct AddRoomBody {
    name: String,
}

async fn add_room(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Json(body): Json<AddRoomBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "部屋名を入力してください" })),
        ));
    }

    let rooms = db::add_studio_room(&pool, &name).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true, "data": rooms })))
}

#[derive(Deserialize)]
struct RenameRoomBody {
    name: String,
}

async fn rename_room(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Path(id): Path<String>,
    Json(body): Json<RenameRoomBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "部屋名を入力してください" })),
        ));
    }

    let rooms = db::update_room_name(&pool, &id, &name).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true, "data": rooms })))
}

async fn delete_room(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Path(_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let rooms = db::delete_last_studio_room(&pool).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true, "data": rooms })))
}
