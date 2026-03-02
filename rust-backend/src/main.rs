mod db;
mod routes;
mod scheduler;
mod types;
mod ws_state;

use anyhow::Result;
use axum::{
    http::{HeaderValue, Method},
    response::Json,
    routing::{delete, get, post, put},
    Router,
};
use std::env;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::routes::kv::{atomic_update, delete_kv, get_kv, list_kv, set_kv};
use crate::routes::ws::ws_handler;
use crate::ws_state::new_ws_state;

#[tokio::main]
async fn main() -> Result<()> {
    // ロギング初期化
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rust_backend=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // .env ファイルのロード（存在すれば）
    let _ = dotenvy::dotenv();

    // 設定
    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8001".to_string())
        .parse()
        .unwrap_or(8001);

    let db_path = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "./reservation_sqlite.db".to_string());

    let line_token = env::var("LINE_CHANNEL_ACCESS_TOKEN").unwrap_or_default();

    // SvelteKit の開発サーバーからのリクエストを許可（CORS）
    let allowed_origins = env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:3000,http://localhost:5173".to_string());

    info!("🚀 Rust KV Server starting...");
    info!("   Database: {}", db_path);
    info!("   Port: {}", port);
    info!(
        "   LINE notifications: {}",
        if line_token.is_empty() { "disabled" } else { "enabled" }
    );

    // DB 接続プール
    let pool = db::create_pool(&db_path).await?;

    // WebSocket 状態
    let ws_state = new_ws_state();

    // LINE 通知スケジューラーをバックグラウンドで起動
    let scheduler_pool = pool.clone();
    let scheduler_token = line_token.clone();
    tokio::spawn(async move {
        scheduler::run_scheduler(scheduler_pool, scheduler_token).await;
    });

    // CORS
    let cors = build_cors(&allowed_origins);

    // ルーター
    let kv_state = pool.clone();
    let ws_combined_state = (pool.clone(), ws_state);

    let app = Router::new()
        // WebSocket
        .route("/ws", get(ws_handler).with_state(ws_combined_state))
        // KV 互換 API
        .route(
            "/api/kv/list/{*prefix}",
            get(list_kv).with_state(kv_state.clone()),
        )
        .route(
            "/api/kv/atomic",
            put(atomic_update).with_state(kv_state.clone()),
        )
        .route(
            "/api/kv/{*key}",
            get(get_kv)
                .post(set_kv)
                .delete(delete_kv)
                .with_state(kv_state.clone()),
        )
        // ヘルスチェック
        .route("/health", get(health_check))
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    info!("🎵 Listening on http://0.0.0.0:{}", port);
    info!("   WebSocket: ws://0.0.0.0:{}/ws", port);

    axum::serve(listener, app).await?;
    Ok(())
}

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "rust-backend",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

fn build_cors(allowed_origins_str: &str) -> CorsLayer {
    let origins: Vec<HeaderValue> = allowed_origins_str
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();

    if origins.is_empty() {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
            .allow_headers(Any)
    } else {
        let mut layer = CorsLayer::new()
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
            .allow_headers(Any);
        for origin in origins {
            layer = layer.allow_origin(origin);
        }
        layer
    }
}
