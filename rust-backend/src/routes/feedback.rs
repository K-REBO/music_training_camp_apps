/// GET  /reservation/api/feedback   (auth)
/// POST /reservation/api/feedback   (auth)
/// PUT  /reservation/api/feedback/:id (admin)

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post, put},
    Router,
};
use chrono::Utc;
use serde::Deserialize;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db;
use crate::extractors::{AdminUser, AuthUser};
use crate::types::{Feedback, FeedbackPriority, FeedbackStatus, FeedbackType};

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/api/feedback", get(list_feedback).post(create_feedback))
        .route("/api/feedback/:id", put(update_feedback))
}

async fn list_feedback(
    State(pool): State<SqlitePool>,
    AuthUser(_user): AuthUser,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let feedback = db::get_all_feedback(&pool).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;
    Ok(Json(serde_json::json!({ "success": true, "data": feedback })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateFeedbackBody {
    #[serde(rename = "type")]
    feedback_type: String,
    title: String,
    description: String,
    #[serde(default)]
    priority: Option<String>,
}

async fn create_feedback(
    State(pool): State<SqlitePool>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateFeedbackBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if body.feedback_type.is_empty() || body.title.is_empty() || body.description.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(
                serde_json::json!({ "success": false, "error": "タイプ、タイトル、説明は必須です" }),
            ),
        ));
    }

    let feedback_type = parse_feedback_type(&body.feedback_type);
    let priority = parse_feedback_priority(body.priority.as_deref().unwrap_or("medium"));

    let feedback = Feedback {
        id: Uuid::new_v4().to_string(),
        user_id: user.user_id,
        user_name: user.user_name,
        feedback_type,
        title: body.title,
        description: body.description,
        priority,
        status: FeedbackStatus::Open,
        created_at: Utc::now().to_rfc3339(),
        updated_at: None,
        version: 0,
    };

    let created = db::create_feedback(&pool, &feedback).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true, "data": created })))
}

#[derive(Deserialize)]
struct UpdateFeedbackBody {
    status: String,
    version: Option<i64>,
}

async fn update_feedback(
    State(pool): State<SqlitePool>,
    AdminUser(_admin): AdminUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateFeedbackBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let status = parse_feedback_status(&body.status);
    let version = body.version.unwrap_or(0);

    db::update_feedback_status(&pool, &id, status, version)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "success": false, "error": e.to_string() })),
            )
        })?;

    Ok(Json(serde_json::json!({ "success": true })))
}

fn parse_feedback_type(s: &str) -> FeedbackType {
    match s {
        "bug" => FeedbackType::Bug,
        "improvement" => FeedbackType::Improvement,
        "feature" => FeedbackType::Feature,
        _ => FeedbackType::Other,
    }
}

fn parse_feedback_priority(s: &str) -> FeedbackPriority {
    match s {
        "low" => FeedbackPriority::Low,
        "high" => FeedbackPriority::High,
        _ => FeedbackPriority::Medium,
    }
}

fn parse_feedback_status(s: &str) -> FeedbackStatus {
    match s {
        "in_progress" => FeedbackStatus::InProgress,
        "resolved" => FeedbackStatus::Resolved,
        "closed" => FeedbackStatus::Closed,
        _ => FeedbackStatus::Open,
    }
}
