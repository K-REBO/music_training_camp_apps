/**
 * WebSocket Client for Server-to-Server Communication
 * SvelteKitサーバーからDeno KV WebSocketサーバーに通知を送信
 */

import WebSocket from 'ws';

interface WebSocketMessage {
  type: string;
  data?: any;
}

class ServerWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageQueue: WebSocketMessage[] = [];
  private isConnecting = false;

  constructor() {
    this.connect();
  }

  private async connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    
    try {
      // サーバー用の専用ユーザーIDでWebSocket接続
      const wsUrl = `ws://127.0.0.1:8001/ws?userId=server&userName=SvelteKit-Server`;;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('🔗 Server WebSocket connected to Deno KV server');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.flushMessageQueue();
      };

      this.ws.onclose = () => {
        console.log('🔌 Server WebSocket disconnected from Deno KV server');
        this.isConnecting = false;
        this.ws = null;
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('❌ Server WebSocket error:', error);
        this.isConnecting = false;
        this.ws = null;
      };

    } catch (error) {
      console.error('Failed to create server WebSocket connection:', error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached for server WebSocket');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    
    console.log(`🔄 Attempting server WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendDirect(message);
      }
    }
  }

  private sendDirect(message: WebSocketMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const messageStr = JSON.stringify(message);
        this.ws.send(messageStr);
        console.log(`📡 Sent WebSocket message: ${message.type}`, message);
        console.log(`📡 Message content: ${messageStr.substring(0, 200)}...`);
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
      }
    } else {
      console.error('📡 WebSocket not ready:', {
        exists: !!this.ws,
        readyState: this.ws?.readyState,
        OPEN: WebSocket.OPEN
      });
    }
  }

  public send(message: WebSocketMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendDirect(message);
    } else {
      // 接続が確立されていない場合はキューに追加
      this.messageQueue.push(message);
      console.log(`📤 WebSocket message queued: ${message.type}`);
      
      // 接続が切れている場合は再接続を試行
      if (!this.isConnecting) {
        this.connect();
      }
    }
  }

  public notifyReservationCreated(data: {
    date: string;
    timeSlotId: string;
    roomId: string;
    reservation: any;
    user: { id: string; name: string };
  }) {
    this.send({
      type: 'reservation_create',
      data
    });
  }

  public notifyReservationCancelled(data: {
    date: string;
    reservationId: string;
    user: { id: string; name: string };
  }) {
    this.send({
      type: 'reservation_cancel', 
      data
    });
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.messageQueue = [];
  }
}

// シングルトンインスタンス
export const serverWsClient = new ServerWebSocketClient();

// プロセス終了時のクリーンアップ
process.on('exit', () => {
  serverWsClient.disconnect();
});

process.on('SIGINT', () => {
  serverWsClient.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  serverWsClient.disconnect();
  process.exit(0);
});