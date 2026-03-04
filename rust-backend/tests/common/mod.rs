/// テスト共通モジュール：インメモリDB + シードデータ + ヘルパー関数

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;
use tower::ServiceExt;

/// インメモリSQLiteプールを作成してマイグレーションを実行する
pub async fn create_test_pool() -> SqlitePool {
    // in-memory DB は max_connections(1) にしないと接続ごとに別DBになる
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .expect("インメモリDB作成失敗");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("マイグレーション失敗");

    pool
}

/// テスト用データを投入する
pub async fn seed_test_data(pool: &SqlitePool) -> SeedData {
    use rust_backend::db;
    use std::collections::HashMap;

    // スケジュール設定（10:00-18:00, 1時間スロット）
    sqlx::query(
        "INSERT INTO schedule_config (id, start_time, end_time, slot_duration_minutes, version) VALUES (1, '10:00', '18:00', 60, 0) ON CONFLICT(id) DO NOTHING"
    )
    .execute(pool)
    .await
    .unwrap();

    // 部屋設定
    sqlx::query(
        "INSERT INTO rooms_config (id, names_json, types_json, version) VALUES (1, '[\"イベント\",\"スタジオA\",\"スタジオB\"]', '[\"event\",\"studio\",\"studio\"]', 0) ON CONFLICT(id) DO NOTHING"
    )
    .execute(pool)
    .await
    .unwrap();

    // テストメンバー作成
    let user1 = db::create_member(pool, "テストユーザー1".to_string(), "1年".to_string(), None)
        .await
        .unwrap();
    let user2 = db::create_member(pool, "テストユーザー2".to_string(), "2年".to_string(), None)
        .await
        .unwrap();
    let admin_user = db::create_member(pool, "椎木知仁".to_string(), "3年".to_string(), None)
        .await
        .unwrap();

    // バンド作成（user1 がメンバー）
    let mut members_map = HashMap::new();
    members_map.insert("ギター".to_string(), user1.name.clone());
    let band = db::create_band(
        pool,
        "テストバンド".to_string(),
        members_map,
        vec![user1.id.clone()],
    )
    .await
    .unwrap();

    SeedData {
        user1,
        user2,
        admin_user,
        band,
    }
}

/// シードデータ保持構造体
#[allow(dead_code)]
pub struct SeedData {
    pub user1: rust_backend::types::Member,
    pub user2: rust_backend::types::Member,
    pub admin_user: rust_backend::types::Member,
    pub band: rust_backend::types::Band,
}

/// テスト用アプリを作成する（シードデータ付き）
pub async fn create_app_with_seed() -> (Router, SeedData) {
    let pool = create_test_pool().await;
    let seed = seed_test_data(&pool).await;
    let app = rust_backend::build_test_app(pool).await;
    (app, seed)
}

/// テスト用アプリを作成する（シードデータなし）
pub async fn create_app() -> Router {
    let pool = create_test_pool().await;
    rust_backend::build_test_app(pool).await
}

/// レスポンスボディを JSON として取得する
pub async fn response_json(
    app: Router,
    req: Request<Body>,
) -> (StatusCode, serde_json::Value) {
    let response = app.oneshot(req).await.expect("リクエスト送信失敗");
    let status = response.status();
    let body = response
        .into_body()
        .collect()
        .await
        .expect("ボディ読み取り失敗")
        .to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
    (status, json)
}

/// DB からセッションを作成してセッションIDを返す
pub async fn create_session(pool: &SqlitePool, member: &rust_backend::types::Member) -> String {
    rust_backend::db::create_session(pool, &member.id, &member.name, &member.grade)
        .await
        .expect("セッション作成失敗")
        .id
}

/// Cookie ヘッダー付き JSON POST リクエストを構築する
pub fn json_post_with_cookie(uri: &str, body: serde_json::Value, session_id: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("Content-Type", "application/json")
        .header("Cookie", format!("session_id={}", session_id))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap()
}

/// Cookie ヘッダー付き DELETE リクエストを構築する
pub fn delete_with_cookie(uri: &str, session_id: &str) -> Request<Body> {
    Request::builder()
        .method("DELETE")
        .uri(uri)
        .header("Cookie", format!("session_id={}", session_id))
        .body(Body::empty())
        .unwrap()
}
