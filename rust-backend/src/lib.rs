pub mod db;
pub mod extractors;
pub mod routes;
pub mod scheduler;
pub mod types;
pub mod ws_state;

use axum::{
    http::Method,
    response::Json,
    routing::get,
    Router,
};
use sqlx::SqlitePool;
use tower::ServiceBuilder;
use tower_http::cors::{Any, CorsLayer};

use crate::routes::kv::{delete_kv, get_or_list_kv, put_kv, set_kv};
use crate::routes::ws::ws_handler;
use crate::ws_state::new_ws_state;

pub async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "rust-backend",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

pub fn build_cors(allowed_origins_str: &str) -> CorsLayer {
    use axum::http::HeaderValue;

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
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
            .allow_headers(Any)
    }
}

/// テスト・CI 用アプリ構築（スケジューラーなし、静的ファイル配信なし）
pub async fn build_test_app(pool: SqlitePool) -> Router {
    let ws_state = new_ws_state();
    let kv_state = pool.clone();
    let ws_combined_state = (pool.clone(), ws_state.clone());

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers(Any);

    let reservation_router = Router::new()
        .merge(routes::auth::router())
        .merge(routes::bands::router())
        .merge(routes::members::router())
        .merge(routes::rooms::router())
        .merge(routes::reservations::router())
        .merge(routes::config::router())
        .merge(routes::feedback::router())
        .merge(routes::admin::router())
        .merge(routes::line::router())
        .route(
            "/api/kv/*path",
            get(get_or_list_kv)
                .post(set_kv)
                .put(put_kv)
                .delete(delete_kv)
                .with_state(kv_state),
        )
        .layer(axum::Extension(ws_state.clone()))
        .with_state(pool.clone());

    Router::new()
        .route("/ws", get(ws_handler).with_state(ws_combined_state))
        .route("/health", get(health_check))
        .nest("/reservation", reservation_router)
        .layer(ServiceBuilder::new().layer(cors))
}
