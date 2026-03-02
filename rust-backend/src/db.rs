use anyhow::{anyhow, Context, Result};
use chrono::{Duration, Utc};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::collections::HashMap;
use uuid::Uuid;

use crate::types::*;

pub async fn create_pool(db_path: &str) -> Result<SqlitePool> {
    let url = format!("sqlite:{db_path}?mode=rwc");
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .with_context(|| format!("Failed to open SQLite database: {db_path}"))?;

    // マイグレーション実行
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .context("Failed to run migrations")?;

    Ok(pool)
}

// ───────────────────────────────────────────────
// Members
// ───────────────────────────────────────────────

pub async fn get_members(pool: &SqlitePool) -> Result<Vec<Member>> {
    let rows = sqlx::query!(
        r#"SELECT id as "id!", name as "name!", grade as "grade!",
           line_user_id, created_at as "created_at!", version as "version!"
           FROM members"#
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| Member {
            id: r.id,
            name: r.name,
            grade: r.grade,
            line_user_id: r.line_user_id,
            created_at: r.created_at,
            version: r.version,
        })
        .collect())
}

pub async fn get_member(pool: &SqlitePool, id: &str) -> Result<Option<Member>> {
    let row = sqlx::query!(
        r#"SELECT id as "id!", name as "name!", grade as "grade!",
           line_user_id, created_at as "created_at!", version as "version!"
           FROM members WHERE id = ?"#,
        id
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| Member {
        id: r.id,
        name: r.name,
        grade: r.grade,
        line_user_id: r.line_user_id,
        created_at: r.created_at,
        version: r.version,
    }))
}

pub async fn create_member(
    pool: &SqlitePool,
    name: String,
    grade: String,
    line_user_id: Option<String>,
) -> Result<Member> {
    let id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    sqlx::query!(
        "INSERT INTO members (id, name, grade, line_user_id, created_at, version) VALUES (?, ?, ?, ?, ?, 0)",
        id, name, grade, line_user_id, created_at
    )
    .execute(pool)
    .await?;
    Ok(Member {
        id,
        name,
        grade,
        line_user_id,
        created_at,
        version: 0,
    })
}

pub async fn update_member(
    pool: &SqlitePool,
    id: &str,
    name: Option<String>,
    grade: Option<String>,
    line_user_id: Option<Option<String>>,
    expected_version: i64,
) -> Result<Member> {
    let current = get_member(pool, id)
        .await?
        .ok_or_else(|| anyhow!("メンバーが見つかりません"))?;

    if current.version != expected_version {
        return Err(anyhow!(
            "データが他のユーザーによって変更されました。ページを再読み込みしてください"
        ));
    }

    let new_name = name.unwrap_or(current.name);
    let new_grade = grade.unwrap_or(current.grade);
    let new_line_user_id = line_user_id.unwrap_or(current.line_user_id);
    let new_version = current.version + 1;

    sqlx::query!(
        "UPDATE members SET name = ?, grade = ?, line_user_id = ?, version = ? WHERE id = ?",
        new_name, new_grade, new_line_user_id, new_version, id
    )
    .execute(pool)
    .await?;

    Ok(Member {
        id: id.to_string(),
        name: new_name,
        grade: new_grade,
        line_user_id: new_line_user_id,
        created_at: current.created_at,
        version: new_version,
    })
}

pub async fn delete_member(pool: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query!("DELETE FROM members WHERE id = ?", id)
        .execute(pool)
        .await?;
    Ok(())
}

// ───────────────────────────────────────────────
// Bands
// ───────────────────────────────────────────────

pub async fn get_bands(pool: &SqlitePool) -> Result<Vec<Band>> {
    let rows = sqlx::query!(
        r#"SELECT id as "id!", name as "name!", members_json as "members_json!",
           created_at as "created_at!", version as "version!"
           FROM bands"#
    )
    .fetch_all(pool)
    .await?;

    let mut bands = Vec::new();
    for r in rows {
        let member_ids = get_band_member_ids(pool, &r.id).await?;
        let members: HashMap<String, String> =
            serde_json::from_str(&r.members_json).unwrap_or_default();
        bands.push(Band {
            id: r.id,
            name: r.name,
            members,
            member_ids,
            created_at: r.created_at,
            version: r.version,
        });
    }
    Ok(bands)
}

pub async fn get_band(pool: &SqlitePool, id: &str) -> Result<Option<Band>> {
    let row = sqlx::query!(
        r#"SELECT id as "id!", name as "name!", members_json as "members_json!",
           created_at as "created_at!", version as "version!"
           FROM bands WHERE id = ?"#,
        id
    )
    .fetch_optional(pool)
    .await?;

    match row {
        None => Ok(None),
        Some(r) => {
            let member_ids = get_band_member_ids(pool, &r.id).await?;
            let members: HashMap<String, String> =
                serde_json::from_str(&r.members_json).unwrap_or_default();
            Ok(Some(Band {
                id: r.id,
                name: r.name,
                members,
                member_ids,
                created_at: r.created_at,
                version: r.version,
            }))
        }
    }
}

async fn get_band_member_ids(pool: &SqlitePool, band_id: &str) -> Result<Vec<String>> {
    let rows = sqlx::query!(
        r#"SELECT member_id as "member_id!" FROM band_members WHERE band_id = ?"#,
        band_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.member_id).collect())
}

pub async fn create_band(
    pool: &SqlitePool,
    name: String,
    members: HashMap<String, String>,
    member_ids: Vec<String>,
) -> Result<Band> {
    let id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    let members_json = serde_json::to_string(&members)?;

    let mut tx = pool.begin().await?;
    sqlx::query!(
        "INSERT INTO bands (id, name, members_json, created_at, version) VALUES (?, ?, ?, ?, 0)",
        id, name, members_json, created_at
    )
    .execute(&mut *tx)
    .await?;

    for mid in &member_ids {
        sqlx::query!(
            "INSERT OR IGNORE INTO band_members (band_id, member_id) VALUES (?, ?)",
            id, mid
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(Band {
        id,
        name,
        members,
        member_ids,
        created_at,
        version: 0,
    })
}

pub async fn update_band(
    pool: &SqlitePool,
    id: &str,
    name: Option<String>,
    members: Option<HashMap<String, String>>,
    member_ids: Option<Vec<String>>,
    expected_version: i64,
) -> Result<Band> {
    let current = get_band(pool, id)
        .await?
        .ok_or_else(|| anyhow!("バンドが見つかりません"))?;

    if current.version != expected_version {
        return Err(anyhow!(
            "データが他のユーザーによって変更されました。ページを再読み込みしてください"
        ));
    }

    let new_name = name.unwrap_or(current.name);
    let new_members = members.unwrap_or(current.members);
    let new_member_ids = member_ids.unwrap_or(current.member_ids);
    let new_version = current.version + 1;
    let members_json = serde_json::to_string(&new_members)?;

    let mut tx = pool.begin().await?;
    sqlx::query!(
        "UPDATE bands SET name = ?, members_json = ?, version = ? WHERE id = ?",
        new_name, members_json, new_version, id
    )
    .execute(&mut *tx)
    .await?;

    // band_members を更新
    sqlx::query!("DELETE FROM band_members WHERE band_id = ?", id)
        .execute(&mut *tx)
        .await?;
    for mid in &new_member_ids {
        sqlx::query!(
            "INSERT OR IGNORE INTO band_members (band_id, member_id) VALUES (?, ?)",
            id, mid
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(Band {
        id: id.to_string(),
        name: new_name,
        members: new_members,
        member_ids: new_member_ids,
        created_at: current.created_at,
        version: new_version,
    })
}

pub async fn delete_band(pool: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query!("DELETE FROM bands WHERE id = ?", id)
        .execute(pool)
        .await?;
    Ok(())
}

// ───────────────────────────────────────────────
// Rooms Config
// ───────────────────────────────────────────────

pub async fn get_rooms_config(pool: &SqlitePool) -> Result<RoomsConfig> {
    let row = sqlx::query!(
        r#"SELECT names_json as "names_json!", types_json as "types_json!",
           version as "version!" FROM rooms_config WHERE id = 1"#
    )
    .fetch_optional(pool)
    .await?;

    match row {
        Some(r) => {
            let names: Vec<String> = serde_json::from_str(&r.names_json).unwrap_or_default();
            let types: Vec<String> = serde_json::from_str(&r.types_json).unwrap_or_default();
            Ok(RoomsConfig {
                names,
                types,
                version: r.version,
            })
        }
        None => {
            // デフォルト設定
            Ok(RoomsConfig {
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
            })
        }
    }
}

pub async fn save_rooms_config(
    pool: &SqlitePool,
    names: Vec<String>,
    types: Vec<String>,
    expected_version: i64,
) -> Result<RoomsConfig> {
    let current = get_rooms_config(pool).await?;
    if current.version != expected_version {
        return Err(anyhow!(
            "データが他のユーザーによって変更されました。ページを再読み込みしてください"
        ));
    }
    let names_json = serde_json::to_string(&names)?;
    let types_json = serde_json::to_string(&types)?;
    let new_version = expected_version + 1;

    sqlx::query!(
        "INSERT INTO rooms_config (id, names_json, types_json, version) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET names_json = excluded.names_json, types_json = excluded.types_json, version = excluded.version",
        names_json, types_json, new_version
    )
    .execute(pool)
    .await?;

    Ok(RoomsConfig {
        names,
        types,
        version: new_version,
    })
}

pub fn build_rooms(config: &RoomsConfig) -> Vec<Room> {
    config
        .names
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let room_type_str = config.types.get(i).map(|s| s.as_str()).unwrap_or("studio");
            let room_type = if room_type_str == "event" {
                RoomType::Event
            } else {
                RoomType::Studio
            };
            let (description, color) = match room_type {
                RoomType::Event => ("イベント会場".to_string(), "#8b5cf6".to_string()),
                RoomType::Studio => ("練習室".to_string(), "#3b82f6".to_string()),
            };
            Room {
                id: format!("room-{}", i + 1),
                name: name.clone(),
                description,
                color,
                room_type,
            }
        })
        .collect()
}

// ───────────────────────────────────────────────
// Schedule Config
// ───────────────────────────────────────────────

pub async fn get_schedule_config(pool: &SqlitePool) -> Result<ScheduleConfig> {
    let row = sqlx::query!(
        r#"SELECT start_time as "start_time!", end_time as "end_time!",
           slot_duration_minutes as "slot_duration_minutes!: i64",
           version as "version!"
           FROM schedule_config WHERE id = 1"#
    )
    .fetch_optional(pool)
    .await?;

    Ok(match row {
        Some(r) => ScheduleConfig {
            start_time: r.start_time,
            end_time: r.end_time,
            slot_duration_minutes: r.slot_duration_minutes as i32,
            version: r.version,
        },
        None => ScheduleConfig {
            start_time: "00:00".to_string(),
            end_time: "24:00".to_string(),
            slot_duration_minutes: 60,
            version: 0,
        },
    })
}

pub fn build_time_slots(config: &ScheduleConfig) -> Vec<TimeSlot> {
    let start_parts: Vec<i32> = config
        .start_time
        .split(':')
        .map(|s| s.parse().unwrap_or(0))
        .collect();
    let end_parts: Vec<i32> = config
        .end_time
        .split(':')
        .map(|s| s.parse().unwrap_or(0))
        .collect();

    let start_total = start_parts[0] * 60 + start_parts.get(1).copied().unwrap_or(0);
    let end_total = end_parts[0] * 60 + end_parts.get(1).copied().unwrap_or(0);
    let duration = config.slot_duration_minutes;

    let mut slots = Vec::new();
    let mut idx = 1;
    let mut minutes = start_total;
    while minutes < end_total {
        let sh = minutes / 60;
        let sm = minutes % 60;
        let em = minutes + duration;
        let eh = em / 60;
        let emm = em % 60;
        let start_str = format!("{:02}:{:02}", sh, sm);
        let end_str = format!("{:02}:{:02}", eh, emm);
        slots.push(TimeSlot {
            id: format!("timeslot-{idx}"),
            start_time: start_str.clone(),
            end_time: end_str.clone(),
            duration,
            display_name: format!("{idx}限 ({start_str}-{end_str})"),
        });
        minutes += duration;
        idx += 1;
    }
    slots
}

// ───────────────────────────────────────────────
// Reservations
// ───────────────────────────────────────────────

pub async fn get_reservations(pool: &SqlitePool, date: &str) -> Result<Vec<Reservation>> {
    let rows = sqlx::query!(
        r#"SELECT id as "id!", user_id as "user_id!", user_name as "user_name!",
           band_id as "band_id!", band_name as "band_name!", room_id as "room_id!",
           room_name as "room_name!", time_slot_id as "time_slot_id!",
           date as "date!", reserved_at as "reserved_at!",
           version as "version!", status as "status!",
           is_personal as "is_personal!", event_name, description
           FROM reservations WHERE date = ? AND status = 'active'"#,
        date
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| Reservation {
        id: r.id,
        user_id: r.user_id,
        user_name: r.user_name,
        band_id: r.band_id,
        band_name: r.band_name,
        room_id: r.room_id,
        room_name: r.room_name,
        time_slot_id: r.time_slot_id,
        date: r.date,
        reserved_at: r.reserved_at,
        version: r.version,
        status: if r.status == "active" {
            ReservationStatus::Active
        } else {
            ReservationStatus::Cancelled
        },
        is_personal: r.is_personal != 0,
        event_name: r.event_name,
        description: r.description,
    }).collect())
}

pub async fn get_reservation(
    pool: &SqlitePool,
    date: &str,
    room_id: &str,
    time_slot_id: &str,
) -> Result<Option<Reservation>> {
    let row = sqlx::query!(
        r#"SELECT id as "id!", user_id as "user_id!", user_name as "user_name!",
           band_id as "band_id!", band_name as "band_name!", room_id as "room_id!",
           room_name as "room_name!", time_slot_id as "time_slot_id!",
           date as "date!", reserved_at as "reserved_at!",
           version as "version!", status as "status!",
           is_personal as "is_personal!", event_name, description
           FROM reservations WHERE date = ? AND room_id = ? AND time_slot_id = ?"#,
        date, room_id, time_slot_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| Reservation {
        id: r.id,
        user_id: r.user_id,
        user_name: r.user_name,
        band_id: r.band_id,
        band_name: r.band_name,
        room_id: r.room_id,
        room_name: r.room_name,
        time_slot_id: r.time_slot_id,
        date: r.date,
        reserved_at: r.reserved_at,
        version: r.version,
        status: if r.status == "active" {
            ReservationStatus::Active
        } else {
            ReservationStatus::Cancelled
        },
        is_personal: r.is_personal != 0,
        event_name: r.event_name,
        description: r.description,
    }))
}

pub async fn create_reservation(pool: &SqlitePool, r: &Reservation) -> Result<Reservation> {
    // 既存の active 予約をチェック
    let existing = get_reservation(pool, &r.date, &r.room_id, &r.time_slot_id).await?;
    if let Some(ex) = existing {
        if ex.status.as_str() == "active" {
            return Err(anyhow!("この時間枠は既に予約されています"));
        }
        // cancelled なら上書き（UPDATE）
        let is_personal_int: i64 = if r.is_personal { 1 } else { 0 };
        let status = r.status.as_str();
        sqlx::query!(
            "UPDATE reservations SET id = ?, user_id = ?, user_name = ?, band_id = ?, \
             band_name = ?, room_name = ?, reserved_at = ?, version = 1, status = ?, \
             is_personal = ?, event_name = ?, description = ? \
             WHERE date = ? AND room_id = ? AND time_slot_id = ?",
            r.id, r.user_id, r.user_name, r.band_id, r.band_name, r.room_name,
            r.reserved_at, status, is_personal_int, r.event_name, r.description,
            r.date, r.room_id, r.time_slot_id
        )
        .execute(pool)
        .await?;
        return Ok(r.clone());
    }

    let is_personal_int: i64 = if r.is_personal { 1 } else { 0 };
    let status = r.status.as_str();
    sqlx::query!(
        "INSERT INTO reservations \
         (id, user_id, user_name, band_id, band_name, room_id, room_name, \
          time_slot_id, date, reserved_at, version, status, is_personal, event_name, description) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)",
        r.id, r.user_id, r.user_name, r.band_id, r.band_name, r.room_id, r.room_name,
        r.time_slot_id, r.date, r.reserved_at, status, is_personal_int, r.event_name, r.description
    )
    .execute(pool)
    .await?;

    Ok(r.clone())
}

pub async fn cancel_reservation(
    pool: &SqlitePool,
    date: &str,
    room_id: &str,
    time_slot_id: &str,
    expected_version: i64,
) -> Result<()> {
    let current = get_reservation(pool, date, room_id, time_slot_id)
        .await?
        .ok_or_else(|| anyhow!("予約が見つかりません"))?;

    if current.version != expected_version {
        return Err(anyhow!(
            "データが他のユーザーによって変更されました。ページを再読み込みしてください"
        ));
    }

    let new_version = current.version + 1;
    sqlx::query!(
        "UPDATE reservations SET status = 'cancelled', version = ? \
         WHERE date = ? AND room_id = ? AND time_slot_id = ?",
        new_version, date, room_id, time_slot_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ───────────────────────────────────────────────
// Sessions
// ───────────────────────────────────────────────

pub async fn create_session(
    pool: &SqlitePool,
    user_id: &str,
    user_name: &str,
    grade: &str,
) -> Result<UserSession> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let created_at = now.to_rfc3339();
    let expires_at = (now + Duration::hours(24)).to_rfc3339();

    sqlx::query!(
        "INSERT INTO sessions (id, user_id, user_name, grade, created_at, expires_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
        id, user_id, user_name, grade, created_at, expires_at
    )
    .execute(pool)
    .await?;

    Ok(UserSession {
        id,
        user_id: user_id.to_string(),
        user_name: user_name.to_string(),
        grade: grade.to_string(),
        created_at,
        expires_at,
    })
}

pub async fn get_session(pool: &SqlitePool, id: &str) -> Result<Option<UserSession>> {
    let now = Utc::now().to_rfc3339();
    let row = sqlx::query!(
        r#"SELECT id as "id!", user_id as "user_id!", user_name as "user_name!",
           grade as "grade!", created_at as "created_at!", expires_at as "expires_at!"
           FROM sessions WHERE id = ? AND expires_at > ?"#,
        id, now
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| UserSession {
        id: r.id,
        user_id: r.user_id,
        user_name: r.user_name,
        grade: r.grade,
        created_at: r.created_at,
        expires_at: r.expires_at,
    }))
}

pub async fn delete_session(pool: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query!("DELETE FROM sessions WHERE id = ?", id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn cleanup_expired_sessions(pool: &SqlitePool) -> Result<u64> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query!("DELETE FROM sessions WHERE expires_at <= ?", now)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

// ───────────────────────────────────────────────
// Feedback
// ───────────────────────────────────────────────

pub async fn get_all_feedback(pool: &SqlitePool) -> Result<Vec<Feedback>> {
    let rows = sqlx::query!(
        r#"SELECT id as "id!", user_id as "user_id!", user_name as "user_name!",
           type as "feedback_type!", title as "title!", description as "description!",
           priority as "priority!", status as "status!",
           created_at as "created_at!", updated_at, version as "version!"
           FROM feedback ORDER BY created_at DESC"#
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| Feedback {
            id: r.id,
            user_id: r.user_id,
            user_name: r.user_name,
            feedback_type: parse_feedback_type(&r.feedback_type),
            title: r.title,
            description: r.description,
            priority: parse_feedback_priority(&r.priority),
            status: parse_feedback_status(&r.status),
            created_at: r.created_at,
            updated_at: r.updated_at,
            version: r.version,
        })
        .collect())
}

pub async fn create_feedback(pool: &SqlitePool, fb: &Feedback) -> Result<Feedback> {
    let fb_type = feedback_type_str(&fb.feedback_type);
    let priority = feedback_priority_str(&fb.priority);
    let status = feedback_status_str(&fb.status);

    sqlx::query!(
        "INSERT OR IGNORE INTO feedback (id, user_id, user_name, type, title, description, \
         priority, status, created_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
        fb.id, fb.user_id, fb.user_name, fb_type, fb.title, fb.description,
        priority, status, fb.created_at
    )
    .execute(pool)
    .await?;
    Ok(fb.clone())
}

pub async fn update_feedback_status(
    pool: &SqlitePool,
    id: &str,
    status: FeedbackStatus,
    expected_version: i64,
) -> Result<()> {
    let current_row = sqlx::query!(
        r#"SELECT version as "version!" FROM feedback WHERE id = ?"#,
        id
    )
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| anyhow!("フィードバックが見つかりません"))?;

    if current_row.version != expected_version {
        return Err(anyhow!(
            "データが他のユーザーによって変更されました。ページを再読み込みしてください"
        ));
    }

    let status_str = feedback_status_str(&status);
    let updated_at = Utc::now().to_rfc3339();
    let new_version = expected_version + 1;
    sqlx::query!(
        "UPDATE feedback SET status = ?, updated_at = ?, version = ? WHERE id = ?",
        status_str, updated_at, new_version, id
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ───────────────────────────────────────────────
// Selections (揮発性 / WebSocket 用)
// ───────────────────────────────────────────────

pub async fn set_selection(
    pool: &SqlitePool,
    sel: &SelectionState,
    date: &str,
    time_slot_id: &str,
    room_id: &str,
) -> Result<()> {
    sqlx::query!(
        "INSERT INTO selections (date, time_slot_id, room_id, user_id, user_name, band_id, band_name, timestamp, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(date, time_slot_id, room_id) DO UPDATE SET
           user_id = excluded.user_id, user_name = excluded.user_name,
           band_id = excluded.band_id, band_name = excluded.band_name,
           timestamp = excluded.timestamp, expires_at = excluded.expires_at",
        date, time_slot_id, room_id,
        sel.user_id, sel.user_name, sel.band_id, sel.band_name,
        sel.timestamp, sel.expires_at
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_selection(
    pool: &SqlitePool,
    date: &str,
    time_slot_id: &str,
    room_id: &str,
) -> Result<Option<SelectionState>> {
    let now_ms = Utc::now().timestamp_millis();
    let row = sqlx::query!(
        r#"SELECT user_id as "user_id!", user_name as "user_name!",
           band_id as "band_id!", band_name as "band_name!",
           timestamp as "timestamp!", expires_at as "expires_at!"
           FROM selections WHERE date = ? AND time_slot_id = ? AND room_id = ? AND expires_at > ?"#,
        date, time_slot_id, room_id, now_ms
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| SelectionState {
        user_id: r.user_id,
        user_name: r.user_name,
        band_id: r.band_id,
        band_name: r.band_name,
        timestamp: r.timestamp,
        expires_at: r.expires_at,
    }))
}

pub async fn delete_selection(
    pool: &SqlitePool,
    date: &str,
    time_slot_id: &str,
    room_id: &str,
) -> Result<()> {
    sqlx::query!(
        "DELETE FROM selections WHERE date = ? AND time_slot_id = ? AND room_id = ?",
        date, time_slot_id, room_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ───────────────────────────────────────────────
// Notified (LINE 通知済みフラグ)
// ───────────────────────────────────────────────

pub async fn is_notified(
    pool: &SqlitePool,
    date: &str,
    room_id: &str,
    slot_id: &str,
) -> Result<bool> {
    let now = Utc::now().to_rfc3339();
    let count: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM notified WHERE date = ? AND room_id = ? AND slot_id = ? AND expires_at > ?",
        date, room_id, slot_id, now
    )
    .fetch_one(pool)
    .await?;
    Ok(count > 0)
}

pub async fn set_notified(
    pool: &SqlitePool,
    date: &str,
    room_id: &str,
    slot_id: &str,
    expires_at: &str,
) -> Result<()> {
    let notified_at = Utc::now().to_rfc3339();
    sqlx::query!(
        "INSERT INTO notified (date, room_id, slot_id, notified_at, expires_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(date, room_id, slot_id) DO UPDATE SET notified_at = excluded.notified_at, expires_at = excluded.expires_at",
        date, room_id, slot_id, notified_at, expires_at
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn cleanup_expired_notified(pool: &SqlitePool) -> Result<u64> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query!("DELETE FROM notified WHERE expires_at <= ?", now)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

// ───────────────────────────────────────────────
// LINE テンプレート
// ───────────────────────────────────────────────

pub async fn get_line_template(pool: &SqlitePool) -> Result<String> {
    let row = sqlx::query!(r#"SELECT template as "template!" FROM line_template WHERE id = 1"#)
        .fetch_optional(pool)
        .await?;
    Ok(row
        .map(|r| r.template)
        .unwrap_or_else(|| "{room}の練習時間が10分後に始まります！準備してください🎸".to_string()))
}

// ───────────────────────────────────────────────
// 管理者チェック
// ───────────────────────────────────────────────

pub async fn is_admin(pool: &SqlitePool, user_id: &str, user_name: &str) -> Result<bool> {
    if user_name == "椎木知仁" {
        return Ok(true);
    }
    let bands = get_bands(pool).await?;
    if let Some(gasshukkakari) = bands.iter().find(|b| b.name == "合宿係") {
        return Ok(gasshukkakari.member_ids.contains(&user_id.to_string()));
    }
    Ok(false)
}

// ───────────────────────────────────────────────
// Enum helpers
// ───────────────────────────────────────────────

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

fn feedback_type_str(t: &FeedbackType) -> &'static str {
    match t {
        FeedbackType::Bug => "bug",
        FeedbackType::Improvement => "improvement",
        FeedbackType::Feature => "feature",
        FeedbackType::Other => "other",
    }
}

fn feedback_priority_str(p: &FeedbackPriority) -> &'static str {
    match p {
        FeedbackPriority::Low => "low",
        FeedbackPriority::Medium => "medium",
        FeedbackPriority::High => "high",
    }
}

fn feedback_status_str(s: &FeedbackStatus) -> &'static str {
    match s {
        FeedbackStatus::Open => "open",
        FeedbackStatus::InProgress => "in_progress",
        FeedbackStatus::Resolved => "resolved",
        FeedbackStatus::Closed => "closed",
    }
}
