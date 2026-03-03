/// セッション認証 Extractor
/// Cookie の session_id から DB ルックアップしてユーザー取得

use axum::{
    async_trait,
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Json, Response},
};
use axum_extra::extract::CookieJar;
use sqlx::SqlitePool;

use crate::db;
use crate::types::{ApiResponse, UserSession};

/// 認証必須ユーザー（なければ 401）
pub struct AuthUser(pub UserSession);

/// 管理者のみ（なければ 403）
pub struct AdminUser(pub UserSession);

/// 任意認証（なくてもOK）
pub struct OptionalUser(pub Option<UserSession>);

fn extract_session_id(jar: &CookieJar) -> Option<String> {
    jar.get("session_id").map(|c| c.value().to_string())
}

#[async_trait]
impl FromRequestParts<SqlitePool> for AuthUser {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SqlitePool,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let session_id = extract_session_id(&jar).ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::<()>::err("認証が必要です")),
            )
                .into_response()
        })?;

        let session = db::get_session(state, &session_id)
            .await
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::<()>::err("セッション確認エラー")),
                )
                    .into_response()
            })?
            .ok_or_else(|| {
                (
                    StatusCode::UNAUTHORIZED,
                    Json(ApiResponse::<()>::err("セッションが無効または期限切れです")),
                )
                    .into_response()
            })?;

        Ok(AuthUser(session))
    }
}

#[async_trait]
impl FromRequestParts<SqlitePool> for AdminUser {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SqlitePool,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let session_id = extract_session_id(&jar).ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::<()>::err("認証が必要です")),
            )
                .into_response()
        })?;

        let session = db::get_session(state, &session_id)
            .await
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::<()>::err("セッション確認エラー")),
                )
                    .into_response()
            })?
            .ok_or_else(|| {
                (
                    StatusCode::UNAUTHORIZED,
                    Json(ApiResponse::<()>::err("セッションが無効または期限切れです")),
                )
                    .into_response()
            })?;

        let admin = db::is_admin(state, &session.user_id, &session.user_name)
            .await
            .unwrap_or(false);

        if !admin {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ApiResponse::<()>::err("管理者権限が必要です")),
            )
                .into_response());
        }

        Ok(AdminUser(session))
    }
}

#[async_trait]
impl FromRequestParts<SqlitePool> for OptionalUser {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SqlitePool,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let Some(session_id) = extract_session_id(&jar) else {
            return Ok(OptionalUser(None));
        };

        let session = db::get_session(state, &session_id).await.ok().flatten();
        Ok(OptionalUser(session))
    }
}
