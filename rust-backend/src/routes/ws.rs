use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
};
use chrono::Utc;
use serde::Deserialize;
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{error, info, warn};

use crate::types::{SelectionState, WsMessage};
use crate::ws_state::SharedWsState;

#[derive(Deserialize)]
pub struct WsQuery {
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "userName")]
    pub user_name: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State((pool, ws_state)): State<(SqlitePool, SharedWsState)>,
) -> Response {
    let user_id = query.user_id.clone();
    let user_name = query.user_name.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, user_id, user_name, pool, ws_state))
}

async fn handle_socket(
    socket: WebSocket,
    user_id: String,
    user_name: String,
    pool: SqlitePool,
    ws_state: SharedWsState,
) {
    use futures::{sink::SinkExt, stream::StreamExt};

    let (mut sender, mut receiver) = socket.split();

    // 接続を登録し、ブロードキャスト受信チャンネルを取得
    let mut rx = {
        let mut state = ws_state.lock().await;
        state.register(user_id.clone(), user_name.clone())
    };

    info!("🔗 WebSocket connected: {} ({})", user_name, user_id);

    // 接続確認メッセージを送信
    let connected_msg = serde_json::to_string(&WsMessage::with_data(
        "connected",
        serde_json::json!({ "userId": user_id, "userName": user_name }),
    ))
    .unwrap_or_default();
    if sender.send(Message::Text(connected_msg.into())).await.is_err() {
        return;
    }

    let uid_recv = user_id.clone();
    let uid_send = user_id.clone();

    // ブロードキャスト受信タスク（他のユーザーからのメッセージを転送）
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // 受信タスク（このユーザーからのメッセージを処理）
    let ws_state_recv = ws_state.clone();
    let pool_recv = pool.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    match serde_json::from_str::<WsMessage>(&text) {
                        Ok(ws_msg) => {
                            handle_ws_message(
                                &uid_recv,
                                ws_msg,
                                &pool_recv,
                                &ws_state_recv,
                            )
                            .await;
                        }
                        Err(e) => warn!("Failed to parse WS message: {}", e),
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // どちらかのタスクが終わったらもう一方をキャンセル
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    // 接続をクリーンアップ
    let mut state = ws_state.lock().await;
    state.remove(&uid_send);
    info!("🔌 WebSocket disconnected: {} ({})", user_name, uid_send);
}

async fn handle_ws_message(
    user_id: &str,
    msg: WsMessage,
    pool: &SqlitePool,
    ws_state: &SharedWsState,
) {
    match msg.msg_type.as_str() {
        "ping" => handle_ping(user_id, ws_state).await,
        "join_room" => {
            if let Some(data) = msg.data {
                if let Some(room) = data.get("room").and_then(|v| v.as_str()) {
                    handle_join_room(user_id, room.to_string(), ws_state).await;
                }
            }
        }
        "leave_room" => {
            if let Some(data) = msg.data {
                if let Some(room) = data.get("room").and_then(|v| v.as_str()) {
                    handle_leave_room(user_id, room, ws_state).await;
                }
            }
        }
        "cell_selecting" => {
            if let Some(data) = msg.data {
                handle_cell_selecting(user_id, data, pool, ws_state).await;
            }
        }
        "cell_deselected" => {
            if let Some(data) = msg.data {
                handle_cell_deselected(user_id, data, pool, ws_state).await;
            }
        }
        "reservation_create" => {
            if let Some(data) = msg.data {
                handle_reservation_create(user_id, data, ws_state).await;
            }
        }
        "reservation_cancel" => {
            if let Some(data) = msg.data {
                handle_reservation_cancel(user_id, data, ws_state).await;
            }
        }
        t => warn!("Unknown WS message type: {}", t),
    }
}

async fn handle_ping(user_id: &str, ws_state: &SharedWsState) {
    let pong = serde_json::to_string(&WsMessage::with_data(
        "pong",
        serde_json::json!({ "timestamp": Utc::now().timestamp_millis() }),
    ))
    .unwrap_or_default();
    ws_state.lock().await.send_to(user_id, &pong);
}

async fn handle_join_room(user_id: &str, room: String, ws_state: &SharedWsState) {
    let user_name = {
        let state = ws_state.lock().await;
        state.get_user_name(user_id).unwrap_or("").to_string()
    };

    {
        let mut state = ws_state.lock().await;
        state.join_room(user_id, room.clone());
    }

    info!("👋 User {} joined room {}", user_name, room);

    let msg = serde_json::to_string(&WsMessage::with_data(
        "user_joined",
        serde_json::json!({ "userId": user_id, "userName": user_name }),
    ))
    .unwrap_or_default();
    ws_state
        .lock()
        .await
        .broadcast_to_room(&room, &msg, Some(user_id));
}

async fn handle_leave_room(user_id: &str, room: &str, ws_state: &SharedWsState) {
    let user_name = {
        let state = ws_state.lock().await;
        state.get_user_name(user_id).unwrap_or("").to_string()
    };

    {
        let mut state = ws_state.lock().await;
        state.leave_room(user_id, room);
    }

    info!("👋 User {} left room {}", user_name, room);

    let msg = serde_json::to_string(&WsMessage::with_data(
        "user_left",
        serde_json::json!({ "userId": user_id, "userName": user_name }),
    ))
    .unwrap_or_default();
    ws_state
        .lock()
        .await
        .broadcast_to_room(room, &msg, Some(user_id));
}

async fn handle_cell_selecting(
    user_id: &str,
    data: serde_json::Value,
    pool: &SqlitePool,
    ws_state: &SharedWsState,
) {
    let date = data.get("date").and_then(|v| v.as_str()).unwrap_or("");
    let time_slot_id = data
        .get("timeSlotId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let room_id = data.get("roomId").and_then(|v| v.as_str()).unwrap_or("");
    let band_id = data.get("bandId").and_then(|v| v.as_str()).unwrap_or("");
    let band_name = data.get("bandName").and_then(|v| v.as_str()).unwrap_or("");

    let user_name = {
        let state = ws_state.lock().await;
        state.get_user_name(user_id).unwrap_or("").to_string()
    };

    // 既存の選択状態をチェック
    if let Ok(Some(existing)) = crate::db::get_selection(pool, date, time_slot_id, room_id).await {
        if existing.user_id != user_id {
            let conflict_msg = serde_json::to_string(&WsMessage::with_data(
                "selection_conflict",
                serde_json::json!({
                    "message": format!("{}さんが既に選択中です", existing.user_name),
                    "currentSelector": existing
                }),
            ))
            .unwrap_or_default();
            ws_state.lock().await.send_to(user_id, &conflict_msg);
            return;
        }
    }

    let now_ms = Utc::now().timestamp_millis();
    let sel = SelectionState {
        user_id: user_id.to_string(),
        user_name: user_name.clone(),
        band_id: band_id.to_string(),
        band_name: band_name.to_string(),
        timestamp: now_ms,
        expires_at: now_ms + 5000, // 5秒後
    };

    if let Err(e) = crate::db::set_selection(pool, &sel, date, time_slot_id, room_id).await {
        error!("Failed to set selection: {}", e);
        return;
    }

    info!(
        "👆 {}: selecting {}-{}",
        user_name,
        &time_slot_id[..time_slot_id.len().min(8)],
        &room_id[..room_id.len().min(8)]
    );

    let msg = serde_json::to_string(&WsMessage::with_data(
        "cell_selecting",
        serde_json::json!({
            "date": date,
            "timeSlotId": time_slot_id,
            "roomId": room_id,
            "user": { "id": user_id, "name": user_name },
            "band": { "id": band_id, "name": band_name }
        }),
    ))
    .unwrap_or_default();
    ws_state
        .lock()
        .await
        .broadcast_to_room(date, &msg, Some(user_id));
}

async fn handle_cell_deselected(
    user_id: &str,
    data: serde_json::Value,
    pool: &SqlitePool,
    ws_state: &SharedWsState,
) {
    let date = data.get("date").and_then(|v| v.as_str()).unwrap_or("");
    let time_slot_id = data
        .get("timeSlotId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let room_id = data.get("roomId").and_then(|v| v.as_str()).unwrap_or("");

    let user_name = {
        let state = ws_state.lock().await;
        state.get_user_name(user_id).unwrap_or("").to_string()
    };

    if let Err(e) = crate::db::delete_selection(pool, date, time_slot_id, room_id).await {
        error!("Failed to delete selection: {}", e);
    }

    info!(
        "👆 {}: deselected {}-{}",
        user_name,
        &time_slot_id[..time_slot_id.len().min(8)],
        &room_id[..room_id.len().min(8)]
    );

    let msg = serde_json::to_string(&WsMessage::with_data(
        "cell_deselected",
        serde_json::json!({
            "date": date,
            "timeSlotId": time_slot_id,
            "roomId": room_id,
            "user": { "id": user_id, "name": user_name }
        }),
    ))
    .unwrap_or_default();
    ws_state
        .lock()
        .await
        .broadcast_to_room(date, &msg, Some(user_id));
}

async fn handle_reservation_create(
    user_id: &str,
    data: serde_json::Value,
    ws_state: &SharedWsState,
) {
    let user_name = {
        let state = ws_state.lock().await;
        state.get_user_name(user_id).unwrap_or("").to_string()
    };

    let date = data.get("date").and_then(|v| v.as_str()).unwrap_or("");
    info!("📅 User {} creating reservation, broadcasting to room {}", user_name, date);

    let mut broadcast_data = data.clone();
    if broadcast_data.get("user").is_none() {
        broadcast_data["user"] = serde_json::json!({ "id": user_id, "name": user_name });
    }

    let msg = serde_json::to_string(&WsMessage::with_data("reservation_created", broadcast_data))
        .unwrap_or_default();
    ws_state.lock().await.broadcast_to_room(date, &msg, None);
}

async fn handle_reservation_cancel(
    user_id: &str,
    data: serde_json::Value,
    ws_state: &SharedWsState,
) {
    let user_name = {
        let state = ws_state.lock().await;
        state.get_user_name(user_id).unwrap_or("").to_string()
    };

    let date = data.get("date").and_then(|v| v.as_str()).unwrap_or("");
    info!("🗑️ User {} cancelling reservation", user_name);

    let mut broadcast_data = data.clone();
    if broadcast_data.get("user").is_none() {
        broadcast_data["user"] = serde_json::json!({ "id": user_id, "name": user_name });
    }

    let msg = serde_json::to_string(&WsMessage::with_data("reservation_cancelled", broadcast_data))
        .unwrap_or_default();
    ws_state.lock().await.broadcast_to_room(date, &msg, None);
}
