mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

/// テスト用予約を作成するリクエストボディ
fn reservation_body(band_id: &str) -> serde_json::Value {
    serde_json::json!({
        "timeSlotId": "timeslot-1",
        "roomId": "room-2",
        "bandId": band_id,
        "date": "2026-08-01"
    })
}

// ─────────────────────────────────────────────────
// 未認証テスト
// ─────────────────────────────────────────────────

#[tokio::test]
async fn test_create_reservation_unauthenticated_returns_401() {
    let app = common::create_app_with_seed().await.0;
    let body = reservation_body("some-band-id");
    let req = Request::builder()
        .method("POST")
        .uri("/reservation/api/reservations")
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let (status, _) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ─────────────────────────────────────────────────
// 重複予約テスト
// ─────────────────────────────────────────────────

#[tokio::test]
async fn test_duplicate_reservation_returns_conflict() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;
    let session_id = common::create_session(&pool, &seed.user1).await;

    // 1回目の予約
    let app1 = rust_backend::build_test_app(pool.clone()).await;
    let body = reservation_body(&seed.band.id);
    let req1 = common::json_post_with_cookie(
        "/reservation/api/reservations",
        body.clone(),
        &session_id,
    );
    let (status1, _) = common::response_json(app1, req1).await;
    assert_eq!(status1, StatusCode::OK, "1回目の予約が失敗しました");

    // 2回目の同じ予約（重複）
    let app2 = rust_backend::build_test_app(pool.clone()).await;
    let req2 = common::json_post_with_cookie(
        "/reservation/api/reservations",
        body,
        &session_id,
    );
    let (status2, _) = common::response_json(app2, req2).await;
    assert_eq!(status2, StatusCode::CONFLICT, "重複予約が 409 を返しませんでした");
}

// ─────────────────────────────────────────────────
// キャンセル権限テスト
// ─────────────────────────────────────────────────

/// 予約を作成してIDを返す
async fn create_reservation(
    pool: &sqlx::SqlitePool,
    session_id: &str,
    band_id: &str,
) -> String {
    let app = rust_backend::build_test_app(pool.clone()).await;
    let body = reservation_body(band_id);
    let req = common::json_post_with_cookie(
        "/reservation/api/reservations",
        body,
        session_id,
    );
    let (status, json) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::OK, "予約作成失敗: {}", json);
    json["data"]["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn test_cancel_own_reservation_succeeds() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;
    let session_id = common::create_session(&pool, &seed.user1).await;

    let resv_id = create_reservation(&pool, &session_id, &seed.band.id).await;

    let app = rust_backend::build_test_app(pool.clone()).await;
    let uri = format!(
        "/reservation/api/reservations/{}?date=2026-08-01&roomId=room-2&timeSlotId=timeslot-1&version=1",
        resv_id
    );
    let (status, _) = common::response_json(
        app,
        common::delete_with_cookie(&uri, &session_id),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn test_cancel_others_reservation_returns_403() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;

    // user1 が予約を作成
    let session1 = common::create_session(&pool, &seed.user1).await;
    let resv_id = create_reservation(&pool, &session1, &seed.band.id).await;

    // user2 がキャンセルを試みる（user2 はバンドメンバーではない）
    let session2 = common::create_session(&pool, &seed.user2).await;
    let app = rust_backend::build_test_app(pool.clone()).await;
    let uri = format!(
        "/reservation/api/reservations/{}?date=2026-08-01&roomId=room-2&timeSlotId=timeslot-1&version=1",
        resv_id
    );
    let (status, _) = common::response_json(
        app,
        common::delete_with_cookie(&uri, &session2),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_band_member_can_cancel_band_reservation() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;

    // user1 が自分のバンド予約を作成
    let session1 = common::create_session(&pool, &seed.user1).await;
    let resv_id = create_reservation(&pool, &session1, &seed.band.id).await;

    // user1 はバンドメンバーなので自分でキャンセルできる（自分が作成者でもある）
    let app = rust_backend::build_test_app(pool.clone()).await;
    let uri = format!(
        "/reservation/api/reservations/{}?date=2026-08-01&roomId=room-2&timeSlotId=timeslot-1&version=1",
        resv_id
    );
    let (status, _) = common::response_json(
        app,
        common::delete_with_cookie(&uri, &session1),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn test_personal_reservation_only_owner_can_cancel() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;

    // user1 が個人枠で予約
    let session1 = common::create_session(&pool, &seed.user1).await;
    let personal_band_id = format!("personal_{}", seed.user1.id);
    let resv_id = create_reservation(&pool, &session1, &personal_band_id).await;

    // user2 がキャンセルを試みる → 403
    let session2 = common::create_session(&pool, &seed.user2).await;
    let app = rust_backend::build_test_app(pool.clone()).await;
    let uri = format!(
        "/reservation/api/reservations/{}?date=2026-08-01&roomId=room-2&timeSlotId=timeslot-1&version=1",
        resv_id
    );
    let (status, _) = common::response_json(
        app,
        common::delete_with_cookie(&uri, &session2),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ─────────────────────────────────────────────────
// 管理者は任意の予約をキャンセルできる
// ─────────────────────────────────────────────────

#[tokio::test]
async fn test_admin_can_cancel_any_reservation() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;

    // user1 が予約を作成
    let session1 = common::create_session(&pool, &seed.user1).await;
    let resv_id = create_reservation(&pool, &session1, &seed.band.id).await;

    // admin (椎木知仁) がキャンセル
    let admin_session = common::create_session(&pool, &seed.admin_user).await;
    let app = rust_backend::build_test_app(pool.clone()).await;
    let uri = format!(
        "/reservation/api/reservations/{}?date=2026-08-01&roomId=room-2&timeSlotId=timeslot-1&version=1",
        resv_id
    );
    let (status, _) = common::response_json(
        app,
        common::delete_with_cookie(&uri, &admin_session),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}
