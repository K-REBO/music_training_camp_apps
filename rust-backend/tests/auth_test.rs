mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

// ─────────────────────────────────────────────────
// ヘルスチェック
// ─────────────────────────────────────────────────

#[tokio::test]
async fn test_health_check() {
    let app = common::create_app().await;
    let req = Request::builder()
        .uri("/health")
        .body(Body::empty())
        .unwrap();
    let (status, json) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["status"], "ok");
}

// ─────────────────────────────────────────────────
// ログイン
// ─────────────────────────────────────────────────

#[tokio::test]
async fn test_login_success() {
    let (app, seed) = common::create_app_with_seed().await;
    let body = serde_json::json!({
        "name": seed.user1.name,
        "grade": seed.user1.grade
    });
    let req = Request::builder()
        .method("POST")
        .uri("/reservation/api/auth/login")
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let (status, json) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["success"], true);
}

#[tokio::test]
async fn test_login_unknown_member_returns_401() {
    let app = common::create_app_with_seed().await.0;
    let body = serde_json::json!({ "name": "存在しないユーザー", "grade": "1年" });
    let req = Request::builder()
        .method("POST")
        .uri("/reservation/api/auth/login")
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let (status, _) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_login_shiiki_without_password_returns_400() {
    let (app, seed) = common::create_app_with_seed().await;
    let body = serde_json::json!({
        "name": seed.admin_user.name,
        "grade": seed.admin_user.grade
    });
    let req = Request::builder()
        .method("POST")
        .uri("/reservation/api/auth/login")
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let (status, json) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(json["success"], false);
}

#[tokio::test]
async fn test_login_shiiki_with_wrong_password_returns_401() {
    let (app, seed) = common::create_app_with_seed().await;
    let body = serde_json::json!({
        "name": seed.admin_user.name,
        "grade": seed.admin_user.grade,
        "password": "wrongpassword"
    });
    let req = Request::builder()
        .method("POST")
        .uri("/reservation/api/auth/login")
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let (status, _) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_login_shiiki_with_correct_password_succeeds() {
    let (app, seed) = common::create_app_with_seed().await;
    // デフォルトパスワード: ADMIN_PASSWORD env or "admin123"
    let body = serde_json::json!({
        "name": seed.admin_user.name,
        "grade": seed.admin_user.grade,
        "password": "admin123"
    });
    let req = Request::builder()
        .method("POST")
        .uri("/reservation/api/auth/login")
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let (status, json) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["success"], true);
}

// ─────────────────────────────────────────────────
// /me エンドポイント
// ─────────────────────────────────────────────────

#[tokio::test]
async fn test_me_unauthenticated_returns_failure() {
    let app = common::create_app().await;
    let req = Request::builder()
        .uri("/reservation/api/auth/me")
        .body(Body::empty())
        .unwrap();
    let (status, json) = common::response_json(app, req).await;
    // 未認証でも 200 を返す（success: false のレスポンス）
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["success"], false);
}

#[tokio::test]
async fn test_me_authenticated_returns_user_info() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;
    let session_id = common::create_session(&pool, &seed.user1).await;
    let app = rust_backend::build_test_app(pool).await;

    let req = Request::builder()
        .uri("/reservation/api/auth/me")
        .header("Cookie", format!("session_id={}", session_id))
        .body(Body::empty())
        .unwrap();
    let (status, json) = common::response_json(app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["success"], true);
    assert_eq!(json["data"]["name"], seed.user1.name);
}

// ─────────────────────────────────────────────────
// ログアウト
// ─────────────────────────────────────────────────

#[tokio::test]
async fn test_logout_clears_session() {
    let pool = common::create_test_pool().await;
    let seed = common::seed_test_data(&pool).await;
    let session_id = common::create_session(&pool, &seed.user1).await;
    let app = rust_backend::build_test_app(pool).await;

    let req = Request::builder()
        .method("POST")
        .uri("/reservation/api/auth/logout")
        .header("Cookie", format!("session_id={}", session_id))
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Set-Cookie ヘッダーでセッションが削除されることを確認
    let set_cookie = response
        .headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    assert!(set_cookie.contains("session_id="), "Set-Cookie ヘッダーが見つかりません: {}", set_cookie);
}
