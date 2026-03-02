/// Deno KV dump.json → SQLite インポーター
/// 使い方:
///   DATABASE_URL=./reservation_sqlite.db \
///     ./import --dump ./dump.json [--dry-run]

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use uuid::Uuid;

// データ型（親クレートの types.rs を参照できないため、ここで再定義）
#[derive(Debug, Deserialize, Serialize)]
struct DumpEntry {
    key: Vec<Value>,
    value: Value,
    versionstamp: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Dump {
    exported_at: Option<String>,
    db_path: Option<String>,
    total_entries: Option<usize>,
    entries: Vec<DumpEntry>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();

    let dump_path = get_arg(&args, "--dump", "./dump.json");
    let dry_run = args.contains(&"--dry-run".to_string());

    let db_path = env::var("DATABASE_URL").unwrap_or_else(|_| "./reservation_sqlite.db".to_string());

    println!("🔧 Deno KV → SQLite インポーター");
    println!("   dump: {}", dump_path);
    println!("   db:   {}", db_path);
    if dry_run {
        println!("   mode: DRY RUN（DBへの書き込みはしません）");
    }

    // dump.json 読み込み
    let content = std::fs::read_to_string(&dump_path)
        .with_context(|| format!("dump ファイルが見つかりません: {}", dump_path))?;
    let dump: Dump = serde_json::from_str(&content)?;

    println!(
        "\n📦 エントリ数: {}",
        dump.total_entries.unwrap_or(dump.entries.len())
    );

    // SQLite 接続
    let pool = if dry_run {
        None
    } else {
        let url = format!("sqlite:{db_path}?mode=rwc");
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .context("SQLite 接続失敗")?;

        // マイグレーション実行
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .context("マイグレーション失敗")?;
        Some(pool)
    };

    let mut stats: HashMap<String, usize> = HashMap::new();
    let mut errors: Vec<String> = Vec::new();

    for entry in &dump.entries {
        let table = entry.key.first().and_then(|v| v.as_str()).unwrap_or("unknown");
        *stats.entry(table.to_string()).or_insert(0) += 1;

        if let Some(pool) = &pool {
            match import_entry(pool, entry).await {
                Ok(_) => {}
                Err(e) => {
                    errors.push(format!("key={:?} error={}", entry.key, e));
                }
            }
        }
    }

    println!("\n📊 インポート結果:");
    let mut sorted_stats: Vec<_> = stats.iter().collect();
    sorted_stats.sort_by_key(|(k, _)| k.clone());
    for (table, count) in sorted_stats {
        println!("  {}: {} エントリ", table, count);
    }

    if !errors.is_empty() {
        println!("\n⚠️  エラー ({} 件):", errors.len());
        for err in &errors[..errors.len().min(10)] {
            println!("  {}", err);
        }
    }

    if dry_run {
        println!("\n✅ DRY RUN 完了（DBへの書き込みはしませんでした）");
    } else {
        println!("\n✅ インポート完了");
    }

    Ok(())
}

async fn import_entry(pool: &sqlx::SqlitePool, entry: &DumpEntry) -> Result<()> {
    let key: Vec<String> = entry
        .key
        .iter()
        .map(|v| match v {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        })
        .collect();

    let table = key.first().map(|s| s.as_str()).unwrap_or("");
    let value = &entry.value;

    // Deno KV の Value が null の場合はスキップ
    if value.is_null() {
        return Ok(());
    }

    match table {
        "members" => import_member(pool, value).await,
        "bands" => import_band(pool, value).await,
        "reservations" => import_reservation(pool, &key, value).await,
        "sessions" => import_session(pool, value).await,
        "feedback" => import_feedback(pool, value).await,
        "config" => import_config(pool, &key, value).await,
        "notified" | "selections" => Ok(()), // 揮発性データはスキップ
        _ => {
            // 未知のキーはスキップ
            Ok(())
        }
    }
}

async fn import_member(pool: &sqlx::SqlitePool, value: &Value) -> Result<()> {
    let id = str_field(value, "id")?;
    let name = str_field(value, "name")?;
    let grade = str_field(value, "grade")?;
    let line_user_id = opt_str_field(value, "lineUserId");
    let created_at = str_field(value, "createdAt").unwrap_or_else(|_| now_iso());
    let version = i64_field(value, "version").unwrap_or(0);

    sqlx::query!(
        "INSERT OR REPLACE INTO members (id, name, grade, line_user_id, created_at, version) \
         VALUES (?, ?, ?, ?, ?, ?)",
        id, name, grade, line_user_id, created_at, version
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn import_band(pool: &sqlx::SqlitePool, value: &Value) -> Result<()> {
    let id = str_field(value, "id")?;
    let name = str_field(value, "name")?;
    let created_at = str_field(value, "createdAt").unwrap_or_else(|_| now_iso());
    let version = i64_field(value, "version").unwrap_or(0);

    // members: {instrument: name} マップ
    let members_obj = value.get("members").cloned().unwrap_or(Value::Object(Default::default()));
    let members_json = serde_json::to_string(&members_obj)?;

    // memberIds: string[]
    let member_ids: Vec<String> = value
        .get("memberIds")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let mut tx = pool.begin().await?;
    sqlx::query!(
        "INSERT OR REPLACE INTO bands (id, name, members_json, created_at, version) VALUES (?, ?, ?, ?, ?)",
        id, name, members_json, created_at, version
    )
    .execute(&mut *tx)
    .await?;

    // band_members
    sqlx::query!("DELETE FROM band_members WHERE band_id = ?", id)
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
    Ok(())
}

async fn import_reservation(pool: &sqlx::SqlitePool, key: &[String], value: &Value) -> Result<()> {
    // key: ["reservations", date, roomId, timeSlotId]
    let date = key.get(1).cloned().unwrap_or_default();
    let room_id = key.get(2).cloned().unwrap_or_default();
    let time_slot_id = key.get(3).cloned().unwrap_or_default();

    if date.is_empty() || room_id.is_empty() || time_slot_id.is_empty() {
        return Ok(());
    }

    let id = str_field(value, "id").unwrap_or_else(|_| Uuid::new_v4().to_string());
    let user_id = str_field(value, "userId").unwrap_or_default();
    let user_name = str_field(value, "userName").unwrap_or_default();
    let band_id = str_field(value, "bandId").unwrap_or_default();
    let band_name = str_field(value, "bandName").unwrap_or_default();
    let room_name = str_field(value, "roomName").unwrap_or_default();
    let reserved_at = str_field(value, "reservedAt").unwrap_or_else(|_| now_iso());
    let version = i64_field(value, "version").unwrap_or(1);
    let status = str_field(value, "status").unwrap_or_else(|_| "active".to_string());
    let is_personal: i64 = value.get("isPersonal").and_then(|v| v.as_bool()).map(|b| b as i64).unwrap_or(0);
    let event_name = opt_str_field(value, "eventName");
    let description = opt_str_field(value, "description");

    sqlx::query!(
        "INSERT OR REPLACE INTO reservations \
         (id, user_id, user_name, band_id, band_name, room_id, room_name, \
          time_slot_id, date, reserved_at, version, status, is_personal, event_name, description) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id, user_id, user_name, band_id, band_name, room_id, room_name,
        time_slot_id, date, reserved_at, version, status, is_personal, event_name, description
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn import_session(pool: &sqlx::SqlitePool, value: &Value) -> Result<()> {
    let id = str_field(value, "id")?;
    let user_id = str_field(value, "userId")?;
    let user_name = str_field(value, "userName")?;
    let grade = str_field(value, "grade")?;
    let created_at = str_field(value, "createdAt").unwrap_or_else(|_| now_iso());
    let expires_at = str_field(value, "expiresAt").unwrap_or_else(|_| now_iso());

    sqlx::query!(
        "INSERT OR REPLACE INTO sessions (id, user_id, user_name, grade, created_at, expires_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
        id, user_id, user_name, grade, created_at, expires_at
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn import_feedback(pool: &sqlx::SqlitePool, value: &Value) -> Result<()> {
    let id = str_field(value, "id")?;
    let user_id = str_field(value, "userId")?;
    let user_name = str_field(value, "userName")?;
    let fb_type = str_field(value, "type").unwrap_or_else(|_| "other".to_string());
    let title = str_field(value, "title")?;
    let desc = str_field(value, "description")?;
    let priority = str_field(value, "priority").unwrap_or_else(|_| "medium".to_string());
    let status = str_field(value, "status").unwrap_or_else(|_| "open".to_string());
    let created_at = str_field(value, "createdAt").unwrap_or_else(|_| now_iso());
    let updated_at = opt_str_field(value, "updatedAt");
    let version = i64_field(value, "version").unwrap_or(0);

    sqlx::query!(
        "INSERT OR REPLACE INTO feedback \
         (id, user_id, user_name, type, title, description, priority, status, created_at, updated_at, version) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id, user_id, user_name, fb_type, title, desc, priority, status, created_at, updated_at, version
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn import_config(pool: &sqlx::SqlitePool, key: &[String], value: &Value) -> Result<()> {
    let sub = key.get(1).map(|s| s.as_str()).unwrap_or("");
    match sub {
        "rooms" => {
            let names: Vec<String> = value
                .get("names")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();
            let types: Vec<String> = value
                .get("types")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();
            let version = i64_field(value, "version").unwrap_or(0);
            let names_json = serde_json::to_string(&names)?;
            let types_json = serde_json::to_string(&types)?;
            sqlx::query!(
                "INSERT INTO rooms_config (id, names_json, types_json, version) VALUES (1, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET names_json = excluded.names_json, types_json = excluded.types_json, version = excluded.version",
                names_json, types_json, version
            )
            .execute(pool)
            .await?;
        }
        "schedule" => {
            let start = opt_str_field(value, "start_time").unwrap_or_else(|| "00:00".to_string());
            let end = opt_str_field(value, "end_time").unwrap_or_else(|| "24:00".to_string());
            let duration = value
                .get("slot_duration_minutes")
                .and_then(|v| v.as_i64())
                .unwrap_or(60) as i32;
            let version = i64_field(value, "version").unwrap_or(0);
            sqlx::query!(
                "INSERT INTO schedule_config (id, start_time, end_time, slot_duration_minutes, version) VALUES (1, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET start_time = excluded.start_time, end_time = excluded.end_time, slot_duration_minutes = excluded.slot_duration_minutes, version = excluded.version",
                start, end, duration, version
            )
            .execute(pool)
            .await?;
        }
        "line_template" => {
            if let Some(template) = value.as_str() {
                let t = template.to_string();
                sqlx::query!(
                    "INSERT INTO line_template (id, template) VALUES (1, ?)
                     ON CONFLICT(id) DO UPDATE SET template = excluded.template",
                    t
                )
                .execute(pool)
                .await?;
            }
        }
        _ => {}
    }
    Ok(())
}

// ───────────────────────────────────────────────
// ヘルパー
// ───────────────────────────────────────────────

fn str_field(v: &Value, field: &str) -> Result<String> {
    v.get(field)
        .and_then(|f| f.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow::anyhow!("フィールド '{}' が見つかりません", field))
}

fn opt_str_field(v: &Value, field: &str) -> Option<String> {
    v.get(field).and_then(|f| f.as_str()).map(|s| s.to_string())
}

fn i64_field(v: &Value, field: &str) -> Result<i64> {
    v.get(field)
        .and_then(|f| f.as_i64())
        .ok_or_else(|| anyhow::anyhow!("フィールド '{}' が見つかりません", field))
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn get_arg(args: &[String], flag: &str, default: &str) -> String {
    let idx = args.iter().position(|a| a == flag);
    if let Some(i) = idx {
        if let Some(val) = args.get(i + 1) {
            return val.clone();
        }
    }
    default.to_string()
}
