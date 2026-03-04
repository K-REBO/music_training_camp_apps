# ─────────────────────────────────────────────────────────────────
# Stage 1: SvelteKit ビルド (Bun)
# ─────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS svelte-builder
WORKDIR /app/reservation

COPY reservation/package.json reservation/bun.lock ./
RUN bun install --frozen-lockfile

COPY reservation/ ./
RUN bun run build

# ─────────────────────────────────────────────────────────────────
# Stage 2: Rust ビルド
# ─────────────────────────────────────────────────────────────────
FROM rust:1.85-slim AS rust-builder
WORKDIR /app/rust-backend

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# sqlx のオフラインモードを有効化（DB接続なしでコンパイル）
ENV SQLX_OFFLINE=true

# 依存のみを先にキャッシュ（レイヤーキャッシュ最適化）
COPY rust-backend/Cargo.toml rust-backend/Cargo.lock ./
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs && echo 'pub fn _noop() {}' > src/lib.rs && \
    cargo build --release 2>/dev/null || true

# ソース全体をコピーしてビルド
COPY rust-backend/ ./
RUN touch src/main.rs src/lib.rs && cargo build --release --bin rust-backend

# ─────────────────────────────────────────────────────────────────
# Stage 3: 最終ランタイムイメージ
# ─────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=rust-builder /app/rust-backend/target/release/rust-backend ./
COPY --from=svelte-builder /app/reservation/build ./static
COPY rust-backend/migrations ./migrations

RUN mkdir -p /data

EXPOSE 8001

ENV PORT=8001 \
    DATABASE_URL=sqlite:/data/reservation.db \
    STATIC_DIR=/app/static \
    ALLOWED_ORIGINS=http://localhost:8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["./rust-backend"]
