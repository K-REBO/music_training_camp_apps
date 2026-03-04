mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

// ─────────────────────────────────────────────────
// メンバー一覧取得
// ─────────────────────────────────────────────────

#[tokio::test]
async fn test_list_members_requires_admin() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;

    // 非管理者ユーザーではアクセス不可
    let session = common::create_session(&pool, &seed.user1).await;
    let app = rust_backend::build_test_app(pool.clone()).await;
    let req = Request::builder()
        .uri("/reservation/api/members")
        .header("Cookie", format!("session_id={}", session))
        .body(Body::empty())
        .unwrap();
    let (status, _) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_list_members_as_admin() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;

    // 管理者ユーザー（椎木知仁）はアクセス可能
    let admin_session = common::create_session(&pool, &seed.admin_user).await;
    let app = rust_backend::build_test_app(pool.clone()).await;
    let req = Request::builder()
        .uri("/reservation/api/members")
        .header("Cookie", format!("session_id={}", admin_session))
        .body(Body::empty())
        .unwrap();
    let (status, json) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["success"], true);
    let members = json["data"].as_array().unwrap();
    assert!(members.len() >= 3, "メンバーが3人以上いるはず");
}

// ─────────────────────────────────────────────────
// メンバー作成
// ─────────────────────────────────────────────────

#[tokio::test]
async fn test_create_member_as_admin() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;
    let admin_session = common::create_session(&pool, &seed.admin_user).await;
    let app = rust_backend::build_test_app(pool.clone()).await;

    let body = serde_json::json!({
        "name": "新メンバー",
        "grade": "4年"
    });
    let req = Request::builder()
        .method("POST")
        .uri("/reservation/api/members")
        .header("Content-Type", "application/json")
        .header("Cookie", format!("session_id={}", admin_session))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let (status, json) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(json["success"], true);
    assert_eq!(json["data"]["name"], "新メンバー");
}

#[tokio::test]
async fn test_create_member_requires_admin() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;
    let session = common::create_session(&pool, &seed.user1).await;
    let app = rust_backend::build_test_app(pool.clone()).await;

    let body = serde_json::json!({
        "name": "不正メンバー",
        "grade": "1年"
    });
    let req = Request::builder()
        .method("POST")
        .uri("/reservation/api/members")
        .header("Content-Type", "application/json")
        .header("Cookie", format!("session_id={}", session))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let (status, _) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ─────────────────────────────────────────────────
// メンバー削除
// ─────────────────────────────────────────────────

#[tokio::test]
async fn test_delete_member_as_admin() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;
    let admin_session = common::create_session(&pool, &seed.admin_user).await;

    // user2 を削除（バンドメンバーではない）
    let app = rust_backend::build_test_app(pool.clone()).await;
    let uri = format!("/reservation/api/members/{}", seed.user2.id);
    let req = Request::builder()
        .method("DELETE")
        .uri(&uri)
        .header("Cookie", format!("session_id={}", admin_session))
        .body(Body::empty())
        .unwrap();
    let (status, json) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::OK, "削除失敗: {}", json);
    assert_eq!(json["success"], true);
}
