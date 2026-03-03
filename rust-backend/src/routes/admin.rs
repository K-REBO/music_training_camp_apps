/// DELETE /reservation/api/admin/clear-reservations  (admin)
/// POST   /reservation/api/admin/studio-assignment    (admin)
/// GET    /reservation/api/export/bands               (admin)

use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
    Router,
};
use chrono::Utc;
use serde::Deserialize;
use sqlx::SqlitePool;

use crate::db;
use crate::extractors::AdminUser;
use crate::types::Reservation;
use crate::types::ReservationStatus;
use uuid::Uuid;

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/api/admin/clear-reservations", delete(clear_reservations))
        .route("/api/admin/studio-assignment", post(studio_assignment))
        .route("/api/export/bands", get(export_bands))
}

async fn clear_reservations(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    db::clear_all_reservations(&pool).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true, "message": "全予約データを削除しました" })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StudioAssignment {
    time_slot_id: String,
    room_id: String,
    band_id: String,
}

#[derive(Deserialize)]
struct StudioAssignmentBody {
    date: String,
    assignments: Vec<StudioAssignment>,
}

async fn studio_assignment(
    State(pool): State<SqlitePool>,
    AdminUser(admin): AdminUser,
    Json(body): Json<StudioAssignmentBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if body.date.is_empty() || body.assignments.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "リクエストが不正です" })),
        ));
    }

    let all_bands = db::get_bands(&pool).await.unwrap_or_default();
    let rooms_config = db::get_rooms_config(&pool).await.unwrap_or_default();
    let rooms = db::build_rooms(&rooms_config);

    let mut created: Vec<Reservation> = Vec::new();
    let mut failed: Vec<serde_json::Value> = Vec::new();

    for a in &body.assignments {
        let band = all_bands.iter().find(|b| b.id == a.band_id);
        let Some(band) = band else {
            failed.push(serde_json::json!({
                "timeSlotId": a.time_slot_id,
                "roomId": a.room_id,
                "reason": format!("バンドが見つかりません: {}", a.band_id)
            }));
            continue;
        };

        let room = rooms.iter().find(|r| r.id == a.room_id);
        let Some(room) = room else {
            failed.push(serde_json::json!({
                "timeSlotId": a.time_slot_id,
                "roomId": a.room_id,
                "reason": format!("部屋が見つかりません: {}", a.room_id)
            }));
            continue;
        };

        let reservation = Reservation {
            id: Uuid::new_v4().to_string(),
            user_id: admin.user_id.clone(),
            user_name: admin.user_name.clone(),
            band_id: band.id.clone(),
            band_name: band.name.clone(),
            room_id: room.id.clone(),
            room_name: room.name.clone(),
            time_slot_id: a.time_slot_id.clone(),
            date: body.date.clone(),
            reserved_at: Utc::now().to_rfc3339(),
            version: 1,
            status: ReservationStatus::Active,
            is_personal: false,
            event_name: None,
            description: None,
        };

        match db::create_reservation(&pool, &reservation).await {
            Ok(r) => created.push(r),
            Err(e) => {
                failed.push(serde_json::json!({
                    "timeSlotId": a.time_slot_id,
                    "roomId": a.room_id,
                    "reason": e.to_string()
                }));
            }
        }
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "created": created,
        "failed": failed
    })))
}

async fn export_bands(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let (members, bands) = tokio::try_join!(db::get_members(&pool), db::get_bands(&pool))
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "success": false, "error": e.to_string() })),
            )
        })?;

    let payload = serde_json::json!({
        "exportedAt": Utc::now().to_rfc3339(),
        "members": members.iter().map(|m| serde_json::json!({ "name": m.name, "grade": m.grade })).collect::<Vec<_>>(),
        "bands": bands.iter().map(|b| serde_json::json!({ "name": b.name, "members": b.members })).collect::<Vec<_>>()
    });

    let body = serde_json::to_string_pretty(&payload).unwrap_or_default();

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/json"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename*=UTF-8''%E3%83%90%E3%83%B3%E3%83%89%E3%83%A1%E3%83%B3%E3%83%90%E3%83%BC%E8%A1%A8.json",
            ),
        ],
        body,
    )
        .into_response())
}
