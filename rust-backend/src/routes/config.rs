/// GET /reservation/api/config
/// GET /reservation/api/timeslots
/// GET /reservation/api/config/line-template   (admin)
/// PUT /reservation/api/config/line-template   (admin)

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, put},
    Router,
};
use serde::Deserialize;
use sqlx::SqlitePool;

use crate::db;
use crate::extractors::AdminUser;

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/api/config", get(get_config))
        .route("/api/timeslots", get(get_timeslots))
        .route(
            "/api/config/line-template",
            get(get_line_template).put(update_line_template),
        )
}

async fn get_config(State(pool): State<SqlitePool>) -> Json<serde_json::Value> {
    let rooms_config = db::get_rooms_config(&pool).await.unwrap_or_default();
    let schedule = db::get_schedule_config(&pool).await.unwrap_or_default();

    Json(serde_json::json!({
        "success": true,
        "data": {
            "app": {
                "name": "合宿予約システム",
                "debug": false
            },
            "features": {
                "band_member_filtering": true
            },
            "reservation": {
                "confirmation_delay_seconds": 3,
                "max_reservations_per_user": 10
            },
            "schedule": {
                "start_time": schedule.start_time,
                "end_time": schedule.end_time,
                "slot_duration_minutes": schedule.slot_duration_minutes
            },
            "rooms": {
                "count": rooms_config.names.len(),
                "names": rooms_config.names,
                "types": rooms_config.types
            },
            "restrictions": {
                "consecutive_slots_limit": 3,
                "daily_personal_limit": 3,
                "daily_band_limit": 3,
                "room_type_permissions": {
                    "event": ["合宿係"]
                },
                "band_restrictions": {
                    "合宿係": ["event"]
                },
                "time_restrictions": [],
                "room_restrictions": []
            }
        }
    }))
}

async fn get_timeslots(State(pool): State<SqlitePool>) -> Json<serde_json::Value> {
    let schedule = db::get_schedule_config(&pool).await.unwrap_or_default();
    let slots = db::build_time_slots(&schedule);
    Json(serde_json::json!({ "success": true, "data": slots }))
}

async fn get_line_template(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let template = db::get_line_template(&pool).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;
    Ok(Json(serde_json::json!({ "success": true, "template": template })))
}

#[derive(Deserialize)]
struct LineTemplateBody {
    template: String,
}

async fn update_line_template(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Json(body): Json<LineTemplateBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let template = body.template.trim().to_string();
    if template.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "テンプレートを入力してください" })),
        ));
    }

    let saved = db::save_line_template(&pool, &template).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true, "template": saved })))
}

// ScheduleConfig と RoomsConfig のデフォルト実装
impl Default for crate::types::ScheduleConfig {
    fn default() -> Self {
        Self {
            start_time: "00:00".to_string(),
            end_time: "24:00".to_string(),
            slot_duration_minutes: 60,
            version: 0,
        }
    }
}

impl Default for crate::types::RoomsConfig {
    fn default() -> Self {
        Self {
            names: vec![
                "イベント".to_string(),
                "スタジオA".to_string(),
                "スタジオB".to_string(),
                "スタジオC".to_string(),
                "スタジオD".to_string(),
                "スタジオE".to_string(),
            ],
            types: vec![
                "event".to_string(),
                "studio".to_string(),
                "studio".to_string(),
                "studio".to_string(),
                "studio".to_string(),
                "studio".to_string(),
            ],
            version: 0,
        }
    }
}
