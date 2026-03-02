/// KV 互換 HTTP API
/// kv-server.ts の GET/POST/DELETE /api/kv/* と PUT /api/kv/atomic を再実装

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;
use std::collections::HashMap;

use crate::types::ApiResponse;

/// KV のキーパスを解析する
/// "/api/kv/members/abc123" → ["members", "abc123"]
fn parse_key_path(path: &str) -> Vec<String> {
    path.split('/')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

// ───────────────────────────────────────────────
// KV ストア（汎用的な JSON ストア）
// 既存の kv-client.ts との互換性のために、以下の KV アクセスを
// 実際のテーブルにディスパッチする
// ───────────────────────────────────────────────

#[derive(Deserialize)]
pub struct PostBody {
    pub value: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtomicBody {
    pub key: Vec<String>,
    pub expected_version: i64,
    pub new_value: Value,
}

/// GET /api/kv/{path} - リスト or 単一キー取得
/// パスが "list/" で始まる場合はプレフィックスリスト、それ以外は単一キー取得
pub async fn get_or_list_kv(
    State(pool): State<SqlitePool>,
    Path(path): Path<String>,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    if let Some(prefix_path) = path.strip_prefix("list/") {
        // GET /api/kv/list/{prefix...}
        let prefix = parse_key_path(prefix_path);
        match dispatch_list(&pool, &prefix).await {
            Ok(entries) => Json(ApiResponse::ok(entries)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::err(e.to_string())),
            )
                .into_response(),
        }
    } else {
        // GET /api/kv/{key...}
        let key = parse_key_path(&path);
        match dispatch_get(&pool, &key).await {
            Ok(value) => Json(ApiResponse::ok(value)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::err(e.to_string())),
            )
                .into_response(),
        }
    }
}

/// POST /api/kv/{key_path} - セット
pub async fn set_kv(
    State(pool): State<SqlitePool>,
    Path(key_path): Path<String>,
    Json(body): Json<PostBody>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<ApiResponse<()>>)> {
    let key = parse_key_path(&key_path);
    let result = dispatch_set(&pool, &key, body.value.clone()).await;
    match result {
        Ok(_) => Ok(Json(ApiResponse::ok(body.value))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(e.to_string())),
        )),
    }
}

/// DELETE /api/kv/{key_path} - 削除
pub async fn delete_kv(
    State(pool): State<SqlitePool>,
    Path(key_path): Path<String>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<ApiResponse<()>>)> {
    let key = parse_key_path(&key_path);
    let result = dispatch_delete(&pool, &key).await;
    match result {
        Ok(_) => Ok(Json(ApiResponse::ok(serde_json::json!({ "deleted": key })))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(e.to_string())),
        )),
    }
}

/// PUT /api/kv/{path} - atomic（path == "atomic"）またはエラー
/// kv-client.ts は PUT /api/kv/atomic のみ使用する
pub async fn put_kv(
    State(pool): State<SqlitePool>,
    Path(path): Path<String>,
    body: Option<Json<AtomicBody>>,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    if path == "atomic" {
        match body {
            Some(Json(b)) => {
                let result = dispatch_atomic(&pool, &b.key, b.expected_version, b.new_value).await;
                match result {
                    Ok(value) => Json(ApiResponse::ok(value)).into_response(),
                    Err(e) => {
                        let msg = e.to_string();
                        let status = if msg.contains("既に予約されています") || msg.contains("変更されました") {
                            StatusCode::CONFLICT
                        } else {
                            StatusCode::INTERNAL_SERVER_ERROR
                        };
                        (status, Json(ApiResponse::err(msg))).into_response()
                    }
                }
            }
            None => (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::err("リクエストボディが不正です".to_string())),
            )
                .into_response(),
        }
    } else {
        (StatusCode::METHOD_NOT_ALLOWED, Json(ApiResponse::err("PUT は /api/kv/atomic のみ対応".to_string()))).into_response()
    }
}

// ───────────────────────────────────────────────
// ディスパッチ関数: KV キーパスに応じてテーブル操作に変換
// ───────────────────────────────────────────────

async fn dispatch_list(
    pool: &SqlitePool,
    prefix: &[String],
) -> anyhow::Result<Vec<HashMap<String, Value>>> {
    let table = prefix.first().map(|s| s.as_str()).unwrap_or("");

    match table {
        "members" => {
            let members = crate::db::get_members(pool).await?;
            Ok(members
                .into_iter()
                .map(|m| {
                    let key = vec!["members".to_string(), m.id.clone()];
                    let value = serde_json::to_value(&m).unwrap_or_default();
                    HashMap::from([
                        ("key".to_string(), serde_json::to_value(key).unwrap()),
                        ("value".to_string(), value),
                    ])
                })
                .collect())
        }
        "bands" => {
            let bands = crate::db::get_bands(pool).await?;
            Ok(bands
                .into_iter()
                .map(|b| {
                    let key = vec!["bands".to_string(), b.id.clone()];
                    let value = serde_json::to_value(&b).unwrap_or_default();
                    HashMap::from([
                        ("key".to_string(), serde_json::to_value(key).unwrap()),
                        ("value".to_string(), value),
                    ])
                })
                .collect())
        }
        "reservations" => {
            let date = prefix.get(1).map(|s| s.as_str()).unwrap_or("");
            if date.is_empty() {
                return Ok(vec![]);
            }
            let reservations = crate::db::get_reservations(pool, date).await?;
            Ok(reservations
                .into_iter()
                .map(|r| {
                    let key = vec![
                        "reservations".to_string(),
                        r.date.clone(),
                        r.room_id.clone(),
                        r.time_slot_id.clone(),
                    ];
                    let value = serde_json::to_value(&r).unwrap_or_default();
                    HashMap::from([
                        ("key".to_string(), serde_json::to_value(key).unwrap()),
                        ("value".to_string(), value),
                    ])
                })
                .collect())
        }
        "feedback" => {
            let feedback = crate::db::get_all_feedback(pool).await?;
            Ok(feedback
                .into_iter()
                .map(|f| {
                    let key = vec!["feedback".to_string(), f.id.clone()];
                    let value = serde_json::to_value(&f).unwrap_or_default();
                    HashMap::from([
                        ("key".to_string(), serde_json::to_value(key).unwrap()),
                        ("value".to_string(), value),
                    ])
                })
                .collect())
        }
        _ => Ok(vec![]),
    }
}

async fn dispatch_get(pool: &SqlitePool, key: &[String]) -> anyhow::Result<Value> {
    let table = key.first().map(|s| s.as_str()).unwrap_or("");
    let id = key.get(1).map(|s| s.as_str()).unwrap_or("");

    match (table, id) {
        ("members", id) if !id.is_empty() => {
            let m = crate::db::get_member(pool, id).await?;
            Ok(serde_json::to_value(m).unwrap_or(Value::Null))
        }
        ("bands", id) if !id.is_empty() => {
            let b = crate::db::get_band(pool, id).await?;
            Ok(serde_json::to_value(b).unwrap_or(Value::Null))
        }
        ("sessions", id) if !id.is_empty() => {
            let s = crate::db::get_session(pool, id).await?;
            Ok(serde_json::to_value(s).unwrap_or(Value::Null))
        }
        ("reservations", _) => {
            // key: ["reservations", date, roomId, timeSlotId]
            let date = id;
            let room_id = key.get(2).map(|s| s.as_str()).unwrap_or("");
            let slot_id = key.get(3).map(|s| s.as_str()).unwrap_or("");
            let r = crate::db::get_reservation(pool, date, room_id, slot_id).await?;
            Ok(serde_json::to_value(r).unwrap_or(Value::Null))
        }
        ("config", "rooms") => {
            let cfg = crate::db::get_rooms_config(pool).await?;
            Ok(serde_json::to_value(cfg).unwrap_or(Value::Null))
        }
        ("config", "schedule") => {
            let cfg = crate::db::get_schedule_config(pool).await?;
            Ok(serde_json::to_value(cfg).unwrap_or(Value::Null))
        }
        ("config", "line_template") => {
            let t = crate::db::get_line_template(pool).await?;
            Ok(Value::String(t))
        }
        _ => Ok(Value::Null),
    }
}

async fn dispatch_set(pool: &SqlitePool, key: &[String], value: Value) -> anyhow::Result<()> {
    let table = key.first().map(|s| s.as_str()).unwrap_or("");

    match table {
        "members" => {
            let m: crate::types::Member = serde_json::from_value(value)?;
            // upsert: まず INSERT OR REPLACE
            sqlx::query!(
                "INSERT OR REPLACE INTO members (id, name, grade, line_user_id, created_at, version) \
                 VALUES (?, ?, ?, ?, ?, ?)",
                m.id, m.name, m.grade, m.line_user_id, m.created_at, m.version
            )
            .execute(pool)
            .await?;
        }
        "bands" => {
            let b: crate::types::Band = serde_json::from_value(value)?;
            let members_json = serde_json::to_string(&b.members)?;
            let mut tx = pool.begin().await?;
            sqlx::query!(
                "INSERT OR REPLACE INTO bands (id, name, members_json, created_at, version) \
                 VALUES (?, ?, ?, ?, ?)",
                b.id, b.name, members_json, b.created_at, b.version
            )
            .execute(&mut *tx)
            .await?;
            sqlx::query!("DELETE FROM band_members WHERE band_id = ?", b.id)
                .execute(&mut *tx)
                .await?;
            for mid in &b.member_ids {
                sqlx::query!(
                    "INSERT OR IGNORE INTO band_members (band_id, member_id) VALUES (?, ?)",
                    b.id, mid
                )
                .execute(&mut *tx)
                .await?;
            }
            tx.commit().await?;
        }
        "sessions" => {
            let s: crate::types::UserSession = serde_json::from_value(value)?;
            sqlx::query!(
                "INSERT OR REPLACE INTO sessions (id, user_id, user_name, grade, created_at, expires_at) \
                 VALUES (?, ?, ?, ?, ?, ?)",
                s.id, s.user_id, s.user_name, s.grade, s.created_at, s.expires_at
            )
            .execute(pool)
            .await?;
        }
        "feedback" => {
            let f: crate::types::Feedback = serde_json::from_value(value)?;
            crate::db::create_feedback(pool, &f).await?;
        }
        _ => {} // 未知のキーは無視
    }
    Ok(())
}

async fn dispatch_delete(pool: &SqlitePool, key: &[String]) -> anyhow::Result<()> {
    let table = key.first().map(|s| s.as_str()).unwrap_or("");
    let id = key.get(1).map(|s| s.as_str()).unwrap_or("");

    match (table, id) {
        ("members", id) if !id.is_empty() => {
            crate::db::delete_member(pool, id).await?;
        }
        ("bands", id) if !id.is_empty() => {
            crate::db::delete_band(pool, id).await?;
        }
        ("sessions", id) if !id.is_empty() => {
            crate::db::delete_session(pool, id).await?;
        }
        ("reservations", _) => {
            // 削除ではなく cancelled に更新
            let date = id;
            let room_id = key.get(2).map(|s| s.as_str()).unwrap_or("");
            let slot_id = key.get(3).map(|s| s.as_str()).unwrap_or("");
            if let Some(r) = crate::db::get_reservation(pool, date, room_id, slot_id).await? {
                crate::db::cancel_reservation(pool, date, room_id, slot_id, r.version).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

async fn dispatch_atomic(
    pool: &SqlitePool,
    key: &[String],
    expected_version: i64,
    new_value: Value,
) -> anyhow::Result<Value> {
    let table = key.first().map(|s| s.as_str()).unwrap_or("");

    match table {
        "reservations" => {
            let date = key.get(1).map(|s| s.as_str()).unwrap_or("");
            let room_id = key.get(2).map(|s| s.as_str()).unwrap_or("");
            let slot_id = key.get(3).map(|s| s.as_str()).unwrap_or("");

            if expected_version == 0 {
                // 新規作成
                let mut r: crate::types::Reservation = serde_json::from_value(new_value)?;
                r.version = 1;
                let created = crate::db::create_reservation(pool, &r).await?;
                Ok(serde_json::to_value(created)?)
            } else {
                // キャンセル（status を cancelled に更新）
                let mut updated: crate::types::Reservation = serde_json::from_value(new_value)?;
                updated.version = expected_version + 1;
                let status_str = updated.status.as_str();
                let new_version = updated.version;
                sqlx::query!(
                    "UPDATE reservations SET status = ?, version = ? \
                     WHERE date = ? AND room_id = ? AND time_slot_id = ? AND version = ?",
                    status_str, new_version, date, room_id, slot_id, expected_version
                )
                .execute(pool)
                .await?;
                Ok(serde_json::to_value(updated)?)
            }
        }
        "members" => {
            let id = key.get(1).map(|s| s.as_str()).unwrap_or("");
            let new_m: crate::types::Member = serde_json::from_value(new_value)?;
            let updated = crate::db::update_member(
                pool,
                id,
                Some(new_m.name),
                Some(new_m.grade),
                Some(new_m.line_user_id),
                expected_version,
            )
            .await?;
            Ok(serde_json::to_value(updated)?)
        }
        "bands" => {
            let id = key.get(1).map(|s| s.as_str()).unwrap_or("");
            let new_b: crate::types::Band = serde_json::from_value(new_value)?;
            let updated = crate::db::update_band(
                pool,
                id,
                Some(new_b.name),
                Some(new_b.members),
                Some(new_b.member_ids),
                expected_version,
            )
            .await?;
            Ok(serde_json::to_value(updated)?)
        }
        "config" => {
            let subkey = key.get(1).map(|s| s.as_str()).unwrap_or("");
            match subkey {
                "rooms" => {
                    let cfg: crate::types::RoomsConfig = serde_json::from_value(new_value)?;
                    let saved =
                        crate::db::save_rooms_config(pool, cfg.names, cfg.types, expected_version)
                            .await?;
                    Ok(serde_json::to_value(saved)?)
                }
                _ => Err(anyhow::anyhow!("Unsupported config key: {}", subkey)),
            }
        }
        "feedback" => {
            let id = key.get(1).map(|s| s.as_str()).unwrap_or("");
            let fb: crate::types::Feedback = serde_json::from_value(new_value)?;
            let status = fb.status.clone();
            crate::db::update_feedback_status(pool, id, status, expected_version).await?;
            Ok(serde_json::to_value(fb)?)
        }
        _ => Err(anyhow::anyhow!("Unsupported key for atomic update: {:?}", key)),
    }
}
