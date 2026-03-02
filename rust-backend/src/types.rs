use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ───────────────────────────────────────────────
// Member
// ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Member {
    pub id: String,
    pub name: String,
    pub grade: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_user_id: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub version: i64,
}

// ───────────────────────────────────────────────
// Band
// ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Band {
    pub id: String,
    pub name: String,
    /// {instrument: memberName} のマップ
    pub members: std::collections::HashMap<String, String>,
    pub member_ids: Vec<String>,
    pub created_at: String,
    #[serde(default)]
    pub version: i64,
}

// ───────────────────────────────────────────────
// Room
// ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Room {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    #[serde(rename = "type")]
    pub room_type: RoomType,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum RoomType {
    Event,
    Studio,
}

impl RoomType {
    pub fn as_str(&self) -> &'static str {
        match self {
            RoomType::Event => "event",
            RoomType::Studio => "studio",
        }
    }
}

// ───────────────────────────────────────────────
// TimeSlot
// ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TimeSlot {
    pub id: String,
    pub start_time: String,
    pub end_time: String,
    pub duration: i32,
    pub display_name: String,
}

// ───────────────────────────────────────────────
// Reservation
// ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Reservation {
    pub id: String,
    pub user_id: String,
    pub user_name: String,
    pub band_id: String,
    pub band_name: String,
    pub room_id: String,
    pub room_name: String,
    pub time_slot_id: String,
    pub date: String,
    pub reserved_at: String,
    pub version: i64,
    pub status: ReservationStatus,
    #[serde(default)]
    pub is_personal: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum ReservationStatus {
    Active,
    Cancelled,
}

impl ReservationStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ReservationStatus::Active => "active",
            ReservationStatus::Cancelled => "cancelled",
        }
    }
}

// ───────────────────────────────────────────────
// UserSession
// ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UserSession {
    pub id: String,
    pub user_id: String,
    pub user_name: String,
    pub grade: String,
    pub created_at: String,
    pub expires_at: String,
}

// ───────────────────────────────────────────────
// Feedback
// ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Feedback {
    pub id: String,
    pub user_id: String,
    pub user_name: String,
    #[serde(rename = "type")]
    pub feedback_type: FeedbackType,
    pub title: String,
    pub description: String,
    pub priority: FeedbackPriority,
    pub status: FeedbackStatus,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum FeedbackType {
    Bug,
    Improvement,
    Feature,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum FeedbackPriority {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum FeedbackStatus {
    Open,
    InProgress,
    Resolved,
    Closed,
}

// ───────────────────────────────────────────────
// WebSocket メッセージ
// ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl WsMessage {
    pub fn new(msg_type: impl Into<String>) -> Self {
        Self {
            msg_type: msg_type.into(),
            data: None,
        }
    }

    pub fn with_data(msg_type: impl Into<String>, data: impl Serialize) -> Self {
        Self {
            msg_type: msg_type.into(),
            data: serde_json::to_value(data).ok(),
        }
    }
}

// ───────────────────────────────────────────────
// API レスポンス
// ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }
}

impl ApiResponse<()> {
    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg.into()),
        }
    }
}

// ───────────────────────────────────────────────
// Rooms / Schedule 設定
// ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomsConfig {
    pub names: Vec<String>,
    pub types: Vec<String>,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleConfig {
    pub start_time: String,
    pub end_time: String,
    pub slot_duration_minutes: i32,
    pub version: i64,
}

// ───────────────────────────────────────────────
// SelectionState (WebSocket / Selections テーブル)
// ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionState {
    pub user_id: String,
    pub user_name: String,
    pub band_id: String,
    pub band_name: String,
    pub timestamp: i64,
    pub expires_at: i64,
}
