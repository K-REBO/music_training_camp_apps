/**
 * Deno KV HTTP API Server with WebSocket Support
 * SvelteKitからHTTP経由でDeno KVにアクセスし、WebSocketでリアルタイム通信を提供
 */

/// <reference lib="deno.unstable" />
import { serve } from "@std/http/server.ts";
import { checkAndSendNotifications, checkAndSendEventNotifications } from "./notification.ts";

// 明示的にDBファイル名を指定
const kv = await Deno.openKv("./reservation.db");

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// WebSocketメッセージの型定義
interface WebSocketMessage {
  type: string;
  data?: any;
}

interface SelectionState {
  userId: string;
  userName: string;
  bandId: string;
  bandName: string;
  timestamp: number;
  expiresAt: number;
}

interface UserConnection {
  userId: string;
  userName: string;
  websocket: WebSocket;
  currentRoom?: string; // date形式の部屋（日付）
}

// アクティブな接続を管理
const activeConnections = new Map<string, UserConnection>();
const roomConnections = new Map<string, Set<string>>(); // room -> userIds

// WebSocketメッセージをブロードキャスト
function broadcastToRoom(room: string, message: WebSocketMessage, excludeUserId?: string) {
  const userIds = roomConnections.get(room);
  
  if (!userIds) {
    return;
  }

  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  
  for (const userId of userIds) {
    if (excludeUserId && userId === excludeUserId) {
      continue;
    }
    
    const connection = activeConnections.get(userId);
    if (connection && connection.websocket.readyState === WebSocket.OPEN) {
      try {
        connection.websocket.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error(`Failed to send message to user ${userId}:`, error);
        cleanupConnection(userId);
      }
    }
  }
  
  if (message.type === "cell_selecting" || message.type === "cell_deselected") {
    console.log(`📡 ${message.type} → ${sentCount} users`);
  }
}

// 接続のクリーンアップ
function cleanupConnection(userId: string) {
  const connection = activeConnections.get(userId);
  if (connection) {
    if (connection.currentRoom) {
      const roomUsers = roomConnections.get(connection.currentRoom);
      if (roomUsers) {
        roomUsers.delete(userId);
        if (roomUsers.size === 0) {
          roomConnections.delete(connection.currentRoom);
        }
      }
    }
    activeConnections.delete(userId);
  }
}

// LINE通知チェック（1分おき）
const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
if (!LINE_TOKEN) {
  console.log("⚠️ LINE_CHANNEL_ACCESS_TOKEN が未設定のため LINE通知は無効");
}
setInterval(() => {
  checkAndSendNotifications(kv, new Date(), LINE_TOKEN)
    .catch((err) => console.error("❌ 通知チェックエラー:", err));
  checkAndSendEventNotifications(kv, new Date(), LINE_TOKEN)
    .catch((err) => console.error("❌ イベント通知チェックエラー:", err));
}, 60 * 1000);

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// WebSocketメッセージハンドラー
async function handleWebSocketMessage(userId: string, message: WebSocketMessage) {
  try {
    switch (message.type) {
      case "ping":
        // ハートビートpingに対してpongで応答
        await handlePing(userId);
        break;
        
      case "join_room":
        await handleJoinRoom(userId, message.data);
        break;
        
      case "leave_room":
        await handleLeaveRoom(userId, message.data);
        break;
        
      case "cell_selecting":
        await handleCellSelecting(userId, message.data);
        break;
        
      case "cell_deselected":
        await handleCellDeselected(userId, message.data);
        break;
        
      case "reservation_create":
        await handleReservationCreate(userId, message.data);
        break;
        
      case "reservation_cancel":
        await handleReservationCancel(userId, message.data);
        break;
        
      default:
        console.log(`Unknown WebSocket message type: ${message.type}`);
    }
  } catch (error) {
    console.error(`Error handling WebSocket message from user ${userId}:`, error);
    
    // エラーメッセージをクライアントに送信
    const connection = activeConnections.get(userId);
    if (connection && connection.websocket.readyState === WebSocket.OPEN) {
      connection.websocket.send(JSON.stringify({
        type: "error",
        data: { message: error.message }
      }));
    }
  }
}

// ハートビートping処理
async function handlePing(userId: string) {
  const connection = activeConnections.get(userId);
  if (!connection) return;
  
  if (connection.websocket.readyState === WebSocket.OPEN) {
    connection.websocket.send(JSON.stringify({
      type: "pong",
      data: { timestamp: Date.now() }
    }));
  }
}

// 部屋への参加
async function handleJoinRoom(userId: string, data: { room: string }) {
  const connection = activeConnections.get(userId);
  if (!connection) return;
  
  // 以前の部屋から退出
  if (connection.currentRoom) {
    const oldRoomUsers = roomConnections.get(connection.currentRoom);
    if (oldRoomUsers) {
      oldRoomUsers.delete(userId);
    }
  }
  
  // 新しい部屋に参加
  connection.currentRoom = data.room;
  
  if (!roomConnections.has(data.room)) {
    roomConnections.set(data.room, new Set());
  }
  roomConnections.get(data.room)!.add(userId);
  
  console.log(`👋 User ${connection.userName} joined room ${data.room}`);
  
  // 他のユーザーに参加通知
  broadcastToRoom(data.room, {
    type: "user_joined",
    data: { userId, userName: connection.userName }
  }, userId);
}

// 部屋からの退出
async function handleLeaveRoom(userId: string, data: { room: string }) {
  const connection = activeConnections.get(userId);
  if (!connection) return;
  
  const roomUsers = roomConnections.get(data.room);
  if (roomUsers) {
    roomUsers.delete(userId);
    if (roomUsers.size === 0) {
      roomConnections.delete(data.room);
    }
  }
  
  connection.currentRoom = undefined;
  
  console.log(`👋 User ${connection.userName} left room ${data.room}`);
  
  // 他のユーザーに退出通知
  broadcastToRoom(data.room, {
    type: "user_left",
    data: { userId, userName: connection.userName }
  }, userId);
}

// セル選択の処理
async function handleCellSelecting(userId: string, data: { date: string, timeSlotId: string, roomId: string, bandId: string, bandName: string }) {
  const connection = activeConnections.get(userId);
  if (!connection) return;
  
  const { date, timeSlotId, roomId, bandId, bandName } = data;
  const selectionKey = ["selections", date, timeSlotId, roomId];
  
  // 既存の選択状態をチェック
  const existingSelection = await kv.get(selectionKey);
  if (existingSelection.value && existingSelection.value.userId !== userId) {
    // 他のユーザーが既に選択中
    connection.websocket.send(JSON.stringify({
      type: "selection_conflict",
      data: { 
        message: `${existingSelection.value.userName}さんが既に選択中です`,
        currentSelector: existingSelection.value
      }
    }));
    return;
  }
  
  // 選択状態をKVに保存（5秒後に期限切れ）
  const selectionState: SelectionState = {
    userId,
    userName: connection.userName,
    bandId,
    bandName,
    timestamp: Date.now(),
    expiresAt: Date.now() + 5000 // 5秒後
  };
  
  await kv.set(selectionKey, selectionState, { expireIn: 5000 });

  console.log(`👆 ${connection.userName}: selecting ${timeSlotId.slice(0,8)}-${roomId.slice(0,8)}`);
  
  // 同じ部屋の他のユーザーに選択状態を通知
  broadcastToRoom(date, {
    type: "cell_selecting",
    data: {
      date, timeSlotId, roomId,
      user: { id: userId, name: connection.userName },
      band: { id: bandId, name: bandName }
    }
  }, userId);
}

// セル選択解除の処理
async function handleCellDeselected(userId: string, data: { date: string, timeSlotId: string, roomId: string }) {
  const connection = activeConnections.get(userId);
  if (!connection) return;
  
  const { date, timeSlotId, roomId } = data;
  const selectionKey = ["selections", date, timeSlotId, roomId];
  
  // KVから選択状態を削除
  await kv.delete(selectionKey);
  
  console.log(`👆 ${connection.userName}: deselected ${timeSlotId.slice(0,8)}-${roomId.slice(0,8)}`);
  
  // 同じ部屋の他のユーザーに選択解除を通知
  broadcastToRoom(date, {
    type: "cell_deselected",
    data: {
      date, timeSlotId, roomId,
      user: { id: userId, name: connection.userName }
    }
  }, userId);
}

// 予約作成の処理
async function handleReservationCreate(userId: string, data: any) {
  const connection = activeConnections.get(userId);
  if (!connection) {
    console.log(`❌ No connection found for userId: ${userId}`);
    return;
  }
  
  console.log(`📅 User ${connection.userName} creating reservation:`, data);
  console.log(`📅 Broadcasting to room: ${data.date}`);
  
  // 予約作成者も含めて全ユーザーに送信（リアルタイムUI更新のため）
  const excludeUserId = undefined; // 誰も除外しない
  console.log(`📅 Broadcasting to all users in room (no exclusions)`);
  
  // 同じ部屋の（他の）ユーザーに予約作成を通知
  broadcastToRoom(data.date, {
    type: "reservation_created",
    data: {
      ...data,
      user: data.user || { id: userId, name: connection.userName }
    }
  }, excludeUserId);
  
  console.log(`📅 Broadcast completed for reservation_created`);
}

// 予約キャンセルの処理
async function handleReservationCancel(userId: string, data: any) {
  const connection = activeConnections.get(userId);
  if (!connection) return;
  
  console.log(`🗑️ User ${connection.userName} cancelling reservation:`, data);
  
  // 予約キャンセル者も含めて全ユーザーに送信（リアルタイムUI更新のため）
  const excludeUserId = undefined; // 誰も除外しない
  
  // 同じ部屋の（他の）ユーザーに予約キャンセルを通知
  broadcastToRoom(data.date, {
    type: "reservation_cancelled",
    data: {
      ...data,
      user: data.user || { id: userId, name: connection.userName }
    }
  }, excludeUserId);
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  
  // Only log non-session requests
  if (!pathname.includes('/sessions/')) {
    console.log(`📥 ${req.method} ${pathname}`);
  }

  // WebSocket upgrade request
  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const userId = url.searchParams.get("userId");
    const userName = url.searchParams.get("userName");
    
    if (!userId || !userName) {
      return new Response("Missing userId or userName", { status: 400 });
    }
    
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    socket.onopen = () => {
      console.log(`🔗 WebSocket connected: ${userName} (${userId})`);
      
      // 接続を登録
      activeConnections.set(userId, {
        userId,
        userName,
        websocket: socket
      });
      
      // 接続確認メッセージを送信
      socket.send(JSON.stringify({
        type: "connected",
        data: { userId, userName }
      }));
    };
    
    socket.onmessage = async (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        await handleWebSocketMessage(userId, message);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };
    
    socket.onclose = () => {
      console.log(`🔌 WebSocket disconnected: ${userName} (${userId})`);
      cleanupConnection(userId);
    };
    
    socket.onerror = (error) => {
      console.error(`WebSocket error for ${userName} (${userId}):`, error);
      cleanupConnection(userId);
    };
    
    return response;
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // GET /api/kv/list/{prefix} - Check this FIRST before general /api/kv/ pattern
    if (req.method === "GET" && pathname.startsWith("/api/kv/list/")) {
      const prefixPath = pathname.replace("/api/kv/list/", "");
      const prefix = prefixPath ? prefixPath.split("/") : [];
      const entries = [];
      
      for await (const entry of kv.list({ prefix })) {
        entries.push({
          key: entry.key,
          value: entry.value
        });
      }
      
      const response: ApiResponse = {
        success: true,
        data: entries
      };
      
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // GET /api/kv/{key}
    if (req.method === "GET" && pathname.startsWith("/api/kv/")) {
      const keyPath = pathname.replace("/api/kv/", "").split("/");
      const result = await kv.get(keyPath);
      
      const response: ApiResponse = {
        success: true,
        data: result.value
      };
      
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // POST /api/kv/{key}
    if (req.method === "POST" && pathname.startsWith("/api/kv/")) {
      const keyPath = pathname.replace("/api/kv/", "").split("/");
      const body = await req.json();
      
      await kv.set(keyPath, body.value);
      
      const response: ApiResponse = {
        success: true,
        data: { key: keyPath, value: body.value }
      };
      
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // DELETE /api/kv/{key}
    if (req.method === "DELETE" && pathname.startsWith("/api/kv/")) {
      const keyPath = pathname.replace("/api/kv/", "").split("/");
      await kv.delete(keyPath);
      
      const response: ApiResponse = {
        success: true,
        data: { deleted: keyPath }
      };
      
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // PUT /api/kv/atomic - 楽観的ロック用のatomic操作
    if (req.method === "PUT" && pathname === "/api/kv/atomic") {
      const body = await req.json();
      const { key, expectedVersion, newValue } = body;
      
      
      const current = await kv.get(key);
      
      // 楽観的ロックのチェック
      const currentVersion = current.value?.version || 0;

      // expectedVersion が 0 の場合は新規作成または初回atomic更新
      // それ以外の場合は既存データの更新（バージョンが一致することを期待）
      if (expectedVersion === 0) {
        if (current.value !== null) {
          const existingStatus = current.value.status;
          const existingVersion = current.value.version ?? 0;

          if (existingStatus !== undefined) {
            // 予約エントリ（status フィールドあり）: cancelled のみ上書き許可
            if (existingStatus !== "cancelled") {
              const response: ApiResponse = {
                success: false,
                error: "この時間枠は既に予約されています"
              };
              return new Response(JSON.stringify(response), {
                status: 409,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }
          } else if (existingVersion > 0) {
            // 予約以外のエントリ（Member/Band等）で既にバージョンが付いている場合は競合
            const response: ApiResponse = {
              success: false,
              error: "データが他のユーザーによって変更されました。ページを再読み込みしてください"
            };
            return new Response(JSON.stringify(response), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          // status なし & version = 0 → 初回atomic更新（マイグレーション）として許可
        }
      } else {
        // 更新の場合：バージョンが期待値と一致することを確認
        if (currentVersion !== expectedVersion) {
          const response: ApiResponse = {
            success: false,
            error: "データが他のユーザーによって変更されました。ページを再読み込みしてください"
          };

          return new Response(JSON.stringify(response), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
      
      const updatedValue = {
        ...newValue,
        version: (expectedVersion || 0) + 1,
        updatedAt: new Date().toISOString()
      };
      
      await kv.set(key, updatedValue);
      
      const response: ApiResponse = {
        success: true,
        data: updatedValue
      };
      
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 404
    const response: ApiResponse = {
      success: false,
      error: "Not found"
    };
    
    return new Response(JSON.stringify(response), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("KV Server Error:", error);
    
    const response: ApiResponse = {
      success: false,
      error: error.message
    };
    
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

const port = 8001;
console.log("🚀 Deno KV Server with WebSocket support starting on:");
console.log(`   HTTP API: http://localhost:${port}`);
console.log(`   WebSocket: ws://localhost:${port}/ws`);
await serve(handler, { port });