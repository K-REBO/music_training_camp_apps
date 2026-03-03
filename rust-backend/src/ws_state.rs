use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};

/// WebSocket ブロードキャスト用のチャンネルサイズ
const BROADCAST_CAPACITY: usize = 128;

/// ユーザーの接続情報
#[derive(Debug, Clone)]
pub struct UserConnection {
    pub user_id: String,
    pub user_name: String,
    pub current_room: Option<String>, // date 形式
    pub sender: broadcast::Sender<String>,
}

/// グローバルな WebSocket 接続状態
#[derive(Default)]
pub struct WsState {
    /// userId → UserConnection
    pub connections: HashMap<String, UserConnection>,
    /// room (date) → userIds
    pub room_connections: HashMap<String, HashSet<String>>,
}

impl WsState {
    pub fn new() -> Self {
        Self::default()
    }

    /// 新しい接続を登録し、そのユーザーへのブロードキャスト送信者を返す
    pub fn register(&mut self, user_id: String, user_name: String) -> broadcast::Receiver<String> {
        let (tx, rx) = broadcast::channel(BROADCAST_CAPACITY);
        self.connections.insert(
            user_id.clone(),
            UserConnection {
                user_id,
                user_name,
                current_room: None,
                sender: tx,
            },
        );
        rx
    }

    /// 接続を解除する
    pub fn remove(&mut self, user_id: &str) {
        if let Some(conn) = self.connections.remove(user_id) {
            if let Some(room) = &conn.current_room {
                if let Some(users) = self.room_connections.get_mut(room) {
                    users.remove(user_id);
                    if users.is_empty() {
                        self.room_connections.remove(room);
                    }
                }
            }
        }
    }

    /// ユーザーを部屋に参加させる
    pub fn join_room(&mut self, user_id: &str, room: String) {
        if let Some(conn) = self.connections.get_mut(user_id) {
            // 以前の部屋から退出
            if let Some(old_room) = conn.current_room.take() {
                if let Some(users) = self.room_connections.get_mut(&old_room) {
                    users.remove(user_id);
                    if users.is_empty() {
                        self.room_connections.remove(&old_room);
                    }
                }
            }
            conn.current_room = Some(room.clone());
        }
        self.room_connections
            .entry(room)
            .or_default()
            .insert(user_id.to_string());
    }

    /// ユーザーを部屋から退出させる
    pub fn leave_room(&mut self, user_id: &str, room: &str) {
        if let Some(conn) = self.connections.get_mut(user_id) {
            if conn.current_room.as_deref() == Some(room) {
                conn.current_room = None;
            }
        }
        if let Some(users) = self.room_connections.get_mut(room) {
            users.remove(user_id);
            if users.is_empty() {
                self.room_connections.remove(room);
            }
        }
    }

    /// 指定ユーザーにメッセージを送信する
    pub fn send_to(&self, user_id: &str, msg: &str) {
        if let Some(conn) = self.connections.get(user_id) {
            let _ = conn.sender.send(msg.to_string());
        }
    }

    /// 部屋の全ユーザーにブロードキャストする（exclude_user_id を除く）
    pub fn broadcast_to_room(&self, room: &str, msg: &str, exclude_user_id: Option<&str>) {
        let users = match self.room_connections.get(room) {
            Some(u) => u.clone(),
            None => return,
        };
        for user_id in &users {
            if exclude_user_id == Some(user_id.as_str()) {
                continue;
            }
            self.send_to(user_id, msg);
        }
    }

    /// 接続ユーザー数
    pub fn connection_count(&self) -> usize {
        self.connections.len()
    }

    /// ユーザー名を取得
    pub fn get_user_name(&self, user_id: &str) -> Option<&str> {
        self.connections.get(user_id).map(|c| c.user_name.as_str())
    }

    /// 現在の部屋を取得
    pub fn get_current_room(&self, user_id: &str) -> Option<&str> {
        self.connections
            .get(user_id)
            .and_then(|c| c.current_room.as_deref())
    }
}

pub type SharedWsState = Arc<Mutex<WsState>>;

pub fn new_ws_state() -> SharedWsState {
    Arc::new(Mutex::new(WsState::new()))
}
