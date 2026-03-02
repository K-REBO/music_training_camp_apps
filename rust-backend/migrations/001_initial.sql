-- Migration 001: Initial schema
-- Deno KV の KV構造をリレーショナルテーブルに正規化

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- メンバーテーブル
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    grade TEXT NOT NULL,
    line_user_id TEXT,
    created_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0
);

-- バンドテーブル
CREATE TABLE IF NOT EXISTS bands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    members_json TEXT NOT NULL DEFAULT '{}',  -- {instrument: memberName} をJSONで保存
    created_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0
);

-- バンドメンバー中間テーブル
CREATE TABLE IF NOT EXISTS band_members (
    band_id TEXT NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    PRIMARY KEY (band_id, member_id)
);

-- 部屋設定テーブル（KV の config/rooms に対応）
CREATE TABLE IF NOT EXISTS rooms_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- 単一行
    names_json TEXT NOT NULL DEFAULT '[]',  -- string[]
    types_json TEXT NOT NULL DEFAULT '[]',  -- ("event"|"studio")[]
    version INTEGER NOT NULL DEFAULT 0
);

-- スケジュール設定テーブル（KV の config/schedule に対応）
CREATE TABLE IF NOT EXISTS schedule_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- 単一行
    start_time TEXT NOT NULL DEFAULT '00:00',
    end_time TEXT NOT NULL DEFAULT '24:00',
    slot_duration_minutes INTEGER NOT NULL DEFAULT 60,
    version INTEGER NOT NULL DEFAULT 0
);

-- LINE テンプレート設定
CREATE TABLE IF NOT EXISTS line_template (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    template TEXT NOT NULL DEFAULT '{room}の練習時間が10分後に始まります！準備してください🎸',
    version INTEGER NOT NULL DEFAULT 0
);

-- 予約テーブル
-- KV キー: ["reservations", date, roomId, timeSlotId]
CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    band_id TEXT NOT NULL,
    band_name TEXT NOT NULL,
    room_id TEXT NOT NULL,
    room_name TEXT NOT NULL,
    time_slot_id TEXT NOT NULL,
    date TEXT NOT NULL,          -- "2024-01-15"
    reserved_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    is_personal INTEGER NOT NULL DEFAULT 0,  -- boolean
    event_name TEXT,
    description TEXT,
    -- 一意制約: 同じ日時・部屋・スロットに active な予約は1つだけ
    UNIQUE (date, room_id, time_slot_id)
);

-- セッションテーブル
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    grade TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- フィードバックテーブル
CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('bug', 'improvement', 'feature', 'other')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TEXT NOT NULL,
    updated_at TEXT,
    version INTEGER NOT NULL DEFAULT 0
);

-- セル選択状態テーブル（WebSocket 経由のリアルタイム状態）
-- Deno KV の ["selections", date, timeSlotId, roomId] に対応
-- 揮発性データなのでメモリ代わりに使うが、TTL は アプリ側で管理
CREATE TABLE IF NOT EXISTS selections (
    date TEXT NOT NULL,
    time_slot_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    band_id TEXT NOT NULL,
    band_name TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,  -- Unix timestamp (ms)
    PRIMARY KEY (date, time_slot_id, room_id)
);

-- LINE 通知済みフラグテーブル
-- KV キー: ["notified", date, roomId, slotId]
CREATE TABLE IF NOT EXISTS notified (
    date TEXT NOT NULL,
    room_id TEXT NOT NULL,
    slot_id TEXT NOT NULL,
    notified_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,     -- 翌日JST 0時
    PRIMARY KEY (date, room_id, slot_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations (date);
CREATE INDEX IF NOT EXISTS idx_reservations_date_room ON reservations (date, room_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_selections_expires ON selections (expires_at);
CREATE INDEX IF NOT EXISTS idx_notified_expires ON notified (expires_at);
