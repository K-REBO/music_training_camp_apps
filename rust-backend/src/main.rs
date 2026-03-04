use anyhow::Result;
use axum::{routing::get, Router};
use std::env;
use tower::ServiceBuilder;
use tower_http::services::{ServeDir, ServeFile};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use rust_backend::{
    build_cors, db, health_check,
    routes::{
        self as routes,
        kv::{delete_kv, get_or_list_kv, put_kv, set_kv},
        ws::ws_handler,
    },
    scheduler,
    ws_state::new_ws_state,
};

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

    let static_dir = env::var("STATIC_DIR").unwrap_or_else(|_| "./static".to_string());

    // SvelteKit の開発サーバーからのリクエストを許可（CORS）
    let allowed_origins = env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:3000,http://localhost:5173".to_string());

    info!("🚀 Rust Backend starting...");
    info!("   Database: {}", db_path);
    info!("   Port: {}", port);
    info!("   Static dir: {}", static_dir);
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

    // WebSocket + KV 互換ルート（既存）
    let kv_state = pool.clone();
    let ws_combined_state = (pool.clone(), ws_state.clone());

    // 静的ファイル配信（SvelteKit static build）
    // /reservation/* にネストするため、2つ作成する
    let serve_static_reservation = ServeDir::new(&static_dir)
        .fallback(ServeFile::new(format!("{}/200.html", static_dir)));
    let serve_static_root = ServeDir::new(&static_dir)
        .fallback(ServeFile::new(format!("{}/200.html", static_dir)));

    // /reservation 配下の REST API + 静的ファイル ルーター
    // NOTE: /reservation/* はこのルーターが処理するため、fallback_service で静的ファイルを配信する
    let reservation_router = Router::new()
        // 新規 REST API
        .merge(routes::auth::router())
        .merge(routes::bands::router())
        .merge(routes::members::router())
        .merge(routes::rooms::router())
        .merge(routes::reservations::router())
        .merge(routes::config::router())
        .merge(routes::feedback::router())
        .merge(routes::admin::router())
        .merge(routes::line::router())
        // KV 互換 API（Phase 3 との互換性維持）
        .route(
            "/api/kv/*path",
            get(get_or_list_kv)
                .post(set_kv)
                .put(put_kv)
                .delete(delete_kv)
                .with_state(kv_state.clone()),
        )
        // /reservation/_app/*, /reservation/login 等の静的ファイルを配信
        .fallback_service(serve_static_reservation)
        .layer(axum::Extension(ws_state.clone()))
        .with_state(pool.clone());

    let app = Router::new()
        // WebSocket
        .route("/ws", get(ws_handler).with_state(ws_combined_state))
        // /reservation/* は REST API + 静的ファイル ルーター
        .nest("/reservation", reservation_router)
        // ヘルスチェック
        .route("/health", get(health_check))
        // / 等、/reservation 以外へのフォールバック
        .fallback_service(serve_static_root)
        .layer(ServiceBuilder::new().layer(cors));

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    info!("🎵 Listening on http://0.0.0.0:{}", port);
    info!("   WebSocket: ws://0.0.0.0:{}/ws", port);
    info!("   REST API: http://0.0.0.0:{}/reservation/api/...", port);

    axum::serve(listener, app).await?;
    Ok(())
}

