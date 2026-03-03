/// GET    /reservation/api/reservations?date=YYYY-MM-DD
/// POST   /reservation/api/reservations
/// DELETE /reservation/api/reservations/:id?date=...&roomId=...&timeSlotId=...&version=...

use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post},
    Router,
};
use chrono::Utc;
use serde::Deserialize;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db;
use crate::extractors::AuthUser;
use crate::types::{Reservation, ReservationStatus, WsMessage};
use crate::ws_state::SharedWsState;

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/api/reservations", get(list_reservations).post(create_reservation))
        .route("/api/reservations/:id", delete(cancel_reservation))
}

#[derive(Deserialize)]
struct DateQuery {
    date: Option<String>,
}

async fn list_reservations(
    State(pool): State<SqlitePool>,
    Query(q): Query<DateQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let date = q.date.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "dateパラメータが必要です" })),
        )
    })?;

    let reservations = db::get_reservations(&pool, &date).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true, "data": reservations })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateReservationBody {
    time_slot_id: String,
    room_id: String,
    band_id: String,
    date: String,
    event_name: Option<String>,
    description: Option<String>,
}

async fn create_reservation(
    State(pool): State<SqlitePool>,
    AuthUser(user): AuthUser,
    Extension(ws_state): Extension<SharedWsState>,
    Json(body): Json<CreateReservationBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if body.time_slot_id.is_empty()
        || body.room_id.is_empty()
        || body.band_id.is_empty()
        || body.date.is_empty()
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "必須フィールドが不足しています" })),
        ));
    }

    // バンド・個人予約の判定
    let (band_id, band_name, is_personal) = if body.band_id.starts_with("personal_") {
        (
            body.band_id.clone(),
            format!("個人枠: {}", user.user_name),
            true,
        )
    } else {
        let band =
            db::get_band(&pool, &body.band_id)
                .await
                .unwrap_or(None)
                .ok_or_else(|| {
                    (
                        StatusCode::NOT_FOUND,
                        Json(
                            serde_json::json!({ "success": false, "error": "バンドが見つかりません" }),
                        ),
                    )
                })?;
        (band.id, band.name, false)
    };

    // 部屋・タイムスロット取得
    let rooms_config = db::get_rooms_config(&pool).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;
    let rooms = db::build_rooms(&rooms_config);
    let schedule = db::get_schedule_config(&pool).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;
    let time_slots = db::build_time_slots(&schedule);

    let room = rooms.iter().find(|r| r.id == body.room_id).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "success": false, "error": "部屋が見つかりません" })),
        )
    })?;
    let time_slot = time_slots
        .iter()
        .find(|ts| ts.id == body.time_slot_id)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(
                    serde_json::json!({ "success": false, "error": "タイムスロットが見つかりません" }),
                ),
            )
        })?;

    let reservation = Reservation {
        id: Uuid::new_v4().to_string(),
        user_id: user.user_id.clone(),
        user_name: user.user_name.clone(),
        band_id,
        band_name,
        room_id: room.id.clone(),
        room_name: room.name.clone(),
        time_slot_id: time_slot.id.clone(),
        date: body.date.clone(),
        reserved_at: Utc::now().to_rfc3339(),
        version: 1,
        status: ReservationStatus::Active,
        is_personal,
        event_name: body.event_name.filter(|s| !s.is_empty()),
        description: body.description.filter(|s| !s.is_empty()),
    };

    let created = db::create_reservation(&pool, &reservation).await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("既に予約されています") {
            (
                StatusCode::CONFLICT,
                Json(serde_json::json!({ "success": false, "error": msg })),
            )
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "success": false, "error": msg })),
            )
        }
    })?;

    // WebSocket ブロードキャスト
    let ws_msg = WsMessage::with_data(
        "reservation_created",
        serde_json::json!({
            "date": body.date,
            "timeSlotId": body.time_slot_id,
            "roomId": body.room_id,
            "reservation": created,
            "user": { "id": user.user_id, "name": user.user_name }
        }),
    );
    if let Ok(json) = serde_json::to_string(&ws_msg) {
        let state = ws_state.lock().await;
        state.broadcast_to_room(&body.date, &json, None);
    }

    Ok(Json(serde_json::json!({ "success": true, "data": created })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancelQuery {
    date: Option<String>,
    room_id: Option<String>,
    time_slot_id: Option<String>,
    version: Option<String>,
}

async fn cancel_reservation(
    State(pool): State<SqlitePool>,
    AuthUser(user): AuthUser,
    Extension(ws_state): Extension<SharedWsState>,
    Path(id): Path<String>,
    Query(q): Query<CancelQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let date = q.date.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "dateが必要です" })),
        )
    })?;
    let room_id = q.room_id.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "roomIdが必要です" })),
        )
    })?;
    let time_slot_id = q.time_slot_id.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "error": "timeSlotIdが必要です" })),
        )
    })?;
    let version: i64 = q
        .version
        .as_deref()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1);

    // 予約取得して権限チェック
    let reservation = db::get_reservation(&pool, &date, &room_id, &time_slot_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "success": false, "error": e.to_string() })),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "success": false, "error": "予約が見つかりません" })),
            )
        })?;

    // キャンセル権限チェック
    if !can_cancel(&pool, &user, &reservation).await {
        return Err((
            StatusCode::FORBIDDEN,
            Json(
                serde_json::json!({ "success": false, "error": "この予約をキャンセルする権限がありません" }),
            ),
        ));
    }

    db::cancel_reservation(&pool, &date, &room_id, &time_slot_id, version)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "success": false, "error": e.to_string() })),
            )
        })?;

    // WebSocket ブロードキャスト
    let ws_msg = WsMessage::with_data(
        "reservation_cancelled",
        serde_json::json!({
            "reservationId": id,
            "date": date,
            "roomId": room_id,
            "timeSlotId": time_slot_id,
            "user": { "id": user.user_id, "name": user.user_name }
        }),
    );
    if let Ok(json) = serde_json::to_string(&ws_msg) {
        let state = ws_state.lock().await;
        state.broadcast_to_room(&date, &json, None);
    }

    Ok(Json(serde_json::json!({ "success": true, "message": "Reservation cancelled" })))
}

async fn can_cancel(
    pool: &SqlitePool,
    user: &crate::types::UserSession,
    reservation: &Reservation,
) -> bool {
    if user.user_name == "椎木知仁" {
        return true;
    }
    if reservation.user_id == user.user_id {
        return true;
    }
    if reservation.band_id.starts_with("personal_") {
        return false;
    }
    if let Ok(Some(band)) = db::get_band(pool, &reservation.band_id).await {
        if band.member_ids.contains(&user.user_id) {
            return true;
        }
    }
    // 管理者チェック
    db::is_admin(pool, &user.user_id, &user.user_name)
        .await
        .unwrap_or(false)
}
