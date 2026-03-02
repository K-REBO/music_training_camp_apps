use anyhow::Result;
use chrono::{DateTime, Datelike, Duration, TimeZone, Timelike, Utc};
use sqlx::SqlitePool;
use std::time;
use tracing::{error, info, warn};

use crate::db;

const STUDIO_ROOM_IDS: &[&str] = &["room-2", "room-3", "room-4", "room-5", "room-6"];

/// 現在時刻から N 分後に開始するスロット ID を返す。
/// 整時（分 = 00）のみマッチする。JST で計算。
pub fn find_target_slot_id(now: DateTime<Utc>, advance_minutes: i64) -> Option<String> {
    let jst_offset = Duration::hours(9);
    let target = now + jst_offset + Duration::minutes(advance_minutes);
    if target.minute() != 0 {
        return None;
    }
    // 00:00 → timeslot-1, 01:00 → timeslot-2, ...
    let slot_index = target.hour() + 1;
    Some(format!("timeslot-{}", slot_index))
}

/// UTC 時刻から JST 日付文字列を返す
fn jst_date_str(now: DateTime<Utc>) -> String {
    let jst = now + Duration::hours(9);
    format!("{:04}-{:02}-{:02}", jst.year(), jst.month(), jst.day())
}

/// 翌日 JST 0 時までの ISO8601 文字列を返す（KV TTL 代わりの expires_at）
fn next_jst_midnight_str(now: DateTime<Utc>) -> String {
    let jst = now + Duration::hours(9);
    let tomorrow_jst = (jst + Duration::days(1))
        .with_hour(0)
        .unwrap()
        .with_minute(0)
        .unwrap()
        .with_second(0)
        .unwrap()
        .with_nanosecond(0)
        .unwrap();
    // UTC に戻す
    let tomorrow_utc = tomorrow_jst - Duration::hours(9);
    tomorrow_utc.to_rfc3339()
}

/// テンプレートにプレースホルダーを適用する
pub fn apply_template(template: &str, room: &str, band: &str, hour: &str) -> String {
    template
        .replace("{room}", room)
        .replace("{band}", band)
        .replace("{hour}", hour)
}

/// LINE Push API でメッセージを送信する
async fn send_line_push(line_user_id: &str, message: &str, token: &str) -> Result<()> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.line.me/v2/bot/message/push")
        .bearer_auth(token)
        .json(&serde_json::json!({
            "to": line_user_id,
            "messages": [{ "type": "text", "text": message }]
        }))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!("LINE API error: {} {}", status, body));
    }
    Ok(())
}

/// スタジオ予約の10分前通知チェック
pub async fn check_and_send_notifications(
    pool: &SqlitePool,
    now: DateTime<Utc>,
    token: &str,
) -> Result<()> {
    let slot_id = match find_target_slot_id(now, 10) {
        Some(s) => s,
        None => return Ok(()),
    };

    let date = jst_date_str(now);
    let expires_at = next_jst_midnight_str(now);

    // slot_id = "timeslot-N" → 開始時刻 = N - 1 時
    let slot_index: u32 = slot_id.replace("timeslot-", "").parse().unwrap_or(1);
    let hour = format!("{}", slot_index - 1);

    let template = db::get_line_template(pool).await?;

    // 部屋設定から room 名を取得
    let rooms_config = db::get_rooms_config(pool).await?;
    let room_name_map: std::collections::HashMap<String, String> = rooms_config
        .names
        .iter()
        .enumerate()
        .map(|(i, name)| (format!("room-{}", i + 1), name.clone()))
        .collect();

    for room_id in STUDIO_ROOM_IDS {
        if db::is_notified(pool, &date, room_id, &slot_id).await? {
            continue;
        }

        let reservation = match db::get_reservation(pool, &date, room_id, &slot_id).await? {
            Some(r) if r.status.as_str() == "active" => r,
            _ => continue,
        };

        let room_name = room_name_map
            .get(*room_id)
            .cloned()
            .unwrap_or_else(|| room_id.to_string());
        let message = apply_template(&template, &room_name, &reservation.band_name, &hour);

        if token.is_empty() {
            info!("LINE_CHANNEL_ACCESS_TOKEN未設定のためスキップ");
        } else {
            let band = match db::get_band(pool, &reservation.band_id).await? {
                Some(b) => b,
                None => {
                    warn!("Band not found: {}", reservation.band_id);
                    continue;
                }
            };

            // メンバー情報を並列取得
            let member_futs: Vec<_> = band
                .member_ids
                .iter()
                .map(|mid| db::get_member(pool, mid))
                .collect();
            let members = futures::future::join_all(member_futs).await;

            for (i, result) in members.into_iter().enumerate() {
                match result {
                    Ok(Some(member)) => {
                        if let Some(line_id) = &member.line_user_id {
                            match send_line_push(line_id, &message, token).await {
                                Ok(_) => info!(
                                    "✅ LINE通知送信: {} → {} {} ({})",
                                    member.name, room_name, slot_id, date
                                ),
                                Err(e) => error!("❌ LINE通知失敗: {}: {}", member.name, e),
                            }
                        } else {
                            info!("LINE未登録のためスキップ: {}", member.name);
                        }
                    }
                    Ok(None) => warn!("Member not found: {}", band.member_ids[i]),
                    Err(e) => error!("Failed to get member: {}", e),
                }
            }
        }

        db::set_notified(pool, &date, room_id, &slot_id, &expires_at).await?;
        info!("🔔 通知完了: {} {} on {}", room_name_map.get(*room_id).unwrap_or(&room_id.to_string()), slot_id, date);
    }

    Ok(())
}

/// イベント予約の10分前通知チェック
pub async fn check_and_send_event_notifications(
    pool: &SqlitePool,
    now: DateTime<Utc>,
    token: &str,
) -> Result<()> {
    let slot_id = match find_target_slot_id(now, 10) {
        Some(s) => s,
        None => return Ok(()),
    };

    let date = jst_date_str(now);
    let expires_at = next_jst_midnight_str(now);
    let slot_index: u32 = slot_id.replace("timeslot-", "").parse().unwrap_or(1);

    let rooms_config = db::get_rooms_config(pool).await?;
    let event_room_ids: Vec<String> = rooms_config
        .types
        .iter()
        .enumerate()
        .filter(|(_, t)| t.as_str() == "event")
        .map(|(i, _)| format!("room-{}", i + 1))
        .collect();

    let room_name_map: std::collections::HashMap<String, String> = rooms_config
        .names
        .iter()
        .enumerate()
        .map(|(i, name)| (format!("room-{}", i + 1), name.clone()))
        .collect();

    // 全メンバーを一度だけ取得
    let all_members = db::get_members(pool).await?;

    for room_id in &event_room_ids {
        if db::is_notified(pool, &date, room_id, &slot_id).await? {
            continue;
        }

        let reservation = match db::get_reservation(pool, &date, room_id, &slot_id).await? {
            Some(r) if r.status.as_str() == "active" => r,
            _ => continue,
        };

        // 連続スロットの2番目以降はスキップ
        if slot_index > 1 {
            let prev_slot = format!("timeslot-{}", slot_index - 1);
            if let Some(prev) = db::get_reservation(pool, &date, room_id, &prev_slot).await? {
                if prev.status.as_str() == "active" {
                    continue;
                }
            }
        }

        let room_name = room_name_map
            .get(room_id)
            .cloned()
            .unwrap_or_else(|| room_id.clone());
        let event_label = reservation.event_name.as_deref().unwrap_or(&room_name);
        let message = match &reservation.description {
            Some(desc) => format!("「{}」が始まります！🎶\n{}", event_label, desc),
            None => format!("「{}」が始まります！🎶", event_label),
        };

        if token.is_empty() {
            info!("LINE_CHANNEL_ACCESS_TOKEN未設定のためスキップ");
        } else {
            for member in &all_members {
                if let Some(line_id) = &member.line_user_id {
                    match send_line_push(line_id, &message, token).await {
                        Ok(_) => info!(
                            "✅ イベント通知送信: {} → {} {} ({})",
                            member.name, room_name, slot_id, date
                        ),
                        Err(e) => error!("❌ イベント通知失敗: {}: {}", member.name, e),
                    }
                } else {
                    info!("LINE未登録のためスキップ: {}", member.name);
                }
            }
        }

        db::set_notified(pool, &date, room_id, &slot_id, &expires_at).await?;
        info!("🔔 イベント通知完了: {} {} on {}", room_name, slot_id, date);
    }

    Ok(())
}

/// 次の JST :50 まで待つ時間を返す
fn duration_until_next_50_jst() -> time::Duration {
    let now = Utc::now();
    let jst = now + Duration::hours(9);
    let current_minute = jst.minute() as i64;
    let current_second = jst.second() as i64;

    // :50 より前なら今時間の :50 まで、:50 以降なら次の時間の :50 まで
    let seconds_to_wait = if current_minute < 50 {
        (50 - current_minute) * 60 - current_second
    } else {
        (110 - current_minute) * 60 - current_second
    };

    time::Duration::from_secs(seconds_to_wait.max(1) as u64)
}

/// バックグラウンドスケジューラーを起動する（毎時 :50 に通知チェック）
pub async fn run_scheduler(pool: SqlitePool, token: String) {
    info!("🕐 LINE通知スケジューラー起動（毎時 :50 に通知チェック）");
    if token.is_empty() {
        warn!("⚠️ LINE_CHANNEL_ACCESS_TOKEN が未設定のため LINE通知は無効");
    }

    loop {
        let wait = duration_until_next_50_jst();
        info!("⏳ 次の通知チェックまで {:.0}分 待機", wait.as_secs_f64() / 60.0);
        tokio::time::sleep(wait).await;

        let now = Utc::now();

        if let Err(e) = check_and_send_notifications(&pool, now, &token).await {
            error!("❌ 通知チェックエラー: {}", e);
        }
        if let Err(e) = check_and_send_event_notifications(&pool, now, &token).await {
            error!("❌ イベント通知チェックエラー: {}", e);
        }

        let _ = db::cleanup_expired_sessions(&pool).await;
        let _ = db::cleanup_expired_notified(&pool).await;
    }
}
