/**
 * WebSocket Manager for Real-time Communication
 * リアルタイム通信用のWebSocket接続管理
 */

import { writable } from 'svelte/store';
import { getWebSocketUrl } from '../config.js';

// WebSocket接続の状態管理
export const wsStatus = writable('disconnected'); // 'connecting', 'connected', 'disconnected', 'error'
export const wsError = writable(null);

// リアルタイムイベントのストア
export const realTimeEvents = writable([]);
export const selectionStates = writable(new Map()); // セル選択状態 key: "date-timeSlotId-roomId", value: {user, band}

export class WebSocketManager {
  constructor() {
    this.ws = null;
    this.userId = null;
    this.userName = null;
    this.currentRoom = null;
    this.reconnectInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10; // iOS用に増加
    this.isIntentionallyClosed = false;
    this.messageQueue = [];
    this.heartbeatInterval = null;
    this.lastHeartbeat = null;
    this.isIOS = this.detectIOS();
    this.visibilityChangeHandler = this.handleVisibilityChange.bind(this);
    this.setupVisibilityHandling();
  }

  /**
   * iOS検出
   */
  detectIOS() {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  /**
   * ページビジビリティ処理のセットアップ
   */
  setupVisibilityHandling() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
      // iOSの場合はpagehide/pageshowイベントも監視
      if (this.isIOS) {
        window.addEventListener('pagehide', this.handlePageHide.bind(this));
        window.addEventListener('pageshow', this.handlePageShow.bind(this));
      }
    }
  }

  /**
   * ページビジビリティ変更ハンドラー
   */
  handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // ページが表示されたときに接続をチェック・復旧
      this.checkAndReconnect();
    } else if (document.visibilityState === 'hidden') {
      // バックグラウンド移行時の処理
      this.handleBackgroundTransition();
    }
  }

  /**
   * ページ非表示ハンドラー（iOS用）
   */
  handlePageHide() {
    this.handleBackgroundTransition();
  }

  /**
   * ページ表示ハンドラー（iOS用）
   */
  handlePageShow() {
    this.checkAndReconnect();
  }

  /**
   * バックグラウンド移行処理
   */
  handleBackgroundTransition() {
    // ハートビートを停止
    this.stopHeartbeat();
  }

  /**
   * 接続チェックと再接続
   */
  checkAndReconnect() {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
        console.log('🔄 Reconnecting after visibility change...');
        this.connect(this.userId, this.userName);
      } else if (this.ws.readyState === WebSocket.OPEN) {
        // 接続は生きているがハートビートを再開
        this.startHeartbeat();
      }
    } else if (this.userId && this.userName && !this.isIntentionallyClosed) {
      console.log('🔄 Reconnecting after page became visible...');
      this.connect(this.userId, this.userName);
    }
  }

  /**
   * ハートビート開始
   */
  startHeartbeat() {
    this.stopHeartbeat(); // 既存のハートビートをクリア
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
        this.lastHeartbeat = Date.now();
      }
    }, 30000); // 30秒間隔
  }

  /**
   * ハートビート停止
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * WebSocket接続を開始
   * @param {string} userId - ユーザーID
   * @param {string} userName - ユーザー名
   */
  connect(userId, userName) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.userId = userId;
    this.userName = userName;
    this.isIntentionallyClosed = false;

    wsStatus.set('connecting');
    
    // 設定ファイルからWebSocket URLを取得
    const wsUrl = `${getWebSocketUrl()}?userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}`;
    console.log(`🔗 Connecting to WebSocket: ${wsUrl}`);
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = (event) => {
        console.log(`🔗 WebSocket connected: ${userName} (${userId})`);
        wsStatus.set('connected');
        wsError.set(null);
        this.reconnectAttempts = 0;
        
        // ハートビート開始
        this.startHeartbeat();
        
        // キューに溜まっていたメッセージを送信
        this.flushMessageQueue();
        
        // 現在の部屋に再参加（再接続時）
        if (this.currentRoom) {
          this.joinRoom(this.currentRoom);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          // Only log important message types
          if (message.type === 'cell_selecting' || message.type === 'cell_deselected' || message.type === 'reservation_created' || message.type === 'reservation_cancelled') {
            console.log(`📨 ${message.type}:`, message.data);
          }
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log(`🔌 WebSocket disconnected: ${userName} (${userId})`, { code: event.code, reason: event.reason });
        wsStatus.set('disconnected');
        this.stopHeartbeat();
        
        if (!this.isIntentionallyClosed) {
          // iOSの場合はより積極的に再接続
          const delay = this.isIOS ? 1000 : 2000;
          setTimeout(() => {
            if (!this.isIntentionallyClosed) {
              this.attemptReconnect();
            }
          }, delay);
        }
      };

      this.ws.onerror = (error) => {
        console.error(`WebSocket error for ${userName} (${userId}):`, error);
        wsStatus.set('error');
        wsError.set('WebSocket connection error');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      wsStatus.set('error');
      wsError.set('Failed to create WebSocket connection');
    }
  }

  /**
   * WebSocket接続を閉じる
   */
  disconnect() {
    this.isIntentionallyClosed = true;
    
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    wsStatus.set('disconnected');
    this.currentRoom = null;
    this.messageQueue = [];
    
    // イベントリスナーをクリーンアップ
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      if (this.isIOS) {
        window.removeEventListener('pagehide', this.handlePageHide.bind(this));
        window.removeEventListener('pageshow', this.handlePageShow.bind(this));
      }
    }
  }

  /**
   * 再接続を試行
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      wsError.set('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
    
    console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectInterval = setTimeout(() => {
      if (!this.isIntentionallyClosed) {
        this.connect(this.userId, this.userName);
      }
    }, delay);
  }

  /**
   * メッセージをWebSocketに送信
   * @param {Object} message - 送信するメッセージ
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // 接続が確立されていない場合はキューに追加
      this.messageQueue.push(message);
      console.log('WebSocket not connected, message queued:', message.type);
    }
  }

  /**
   * キューに溜まったメッセージを送信
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  /**
   * 部屋（日付）への参加
   * @param {string} room - 部屋名（日付）
   */
  joinRoom(room) {
    this.currentRoom = room;
    this.send({
      type: 'join_room',
      data: { room }
    });
  }

  /**
   * 部屋からの退出
   * @param {string} room - 部屋名（日付）
   */
  leaveRoom(room) {
    this.send({
      type: 'leave_room',
      data: { room }
    });
    
    if (this.currentRoom === room) {
      this.currentRoom = null;
    }
  }

  /**
   * セル選択の通知
   * @param {string} date - 日付
   * @param {string} timeSlotId - 時間枠ID
   * @param {string} roomId - 部屋ID
   * @param {string} bandId - バンドID
   * @param {string} bandName - バンド名
   */
  selectCell(date, timeSlotId, roomId, bandId, bandName) {
    this.send({
      type: 'cell_selecting',
      data: { date, timeSlotId, roomId, bandId, bandName }
    });
  }

  /**
   * セル選択解除の通知
   * @param {string} date - 日付
   * @param {string} timeSlotId - 時間枠ID
   * @param {string} roomId - 部屋ID
   */
  deselectCell(date, timeSlotId, roomId) {
    console.log(`🚫 WebSocket deselectCell: ${date}-${timeSlotId}-${roomId}`);
    this.send({
      type: 'cell_deselected',
      data: { date, timeSlotId, roomId }
    });
  }

  /**
   * 予約作成の通知
   * @param {Object} reservationData - 予約データ
   */
  notifyReservationCreate(reservationData) {
    this.send({
      type: 'reservation_create',
      data: reservationData
    });
  }

  /**
   * 予約キャンセルの通知
   * @param {Object} cancelData - キャンセルデータ
   */
  notifyReservationCancel(cancelData) {
    this.send({
      type: 'reservation_cancel',
      data: cancelData
    });
  }

  /**
   * WebSocketメッセージハンドラー
   * @param {Object} message - 受信メッセージ
   */
  handleMessage(message) {
    
    // リアルタイムイベントストアに追加
    realTimeEvents.update(events => {
      const newEvents = [...events, { ...message, timestamp: Date.now() }];
      // 直近100件のイベントのみ保持
      return newEvents.slice(-100);
    });

    switch (message.type) {
      case 'connected':
        console.log(`✅ Connected as ${message.data.userName}`);
        break;

      case 'pong':
        // ハートビート応答を受信
        this.lastHeartbeat = Date.now();
        break;

      case 'user_joined':
        console.log(`👋 ${message.data.userName} joined the room`);
        break;

      case 'user_left':
        console.log(`👋 ${message.data.userName} left the room`);
        break;

      case 'cell_selecting':
        this.handleCellSelecting(message.data);
        break;

      case 'cell_deselected':
        this.handleCellDeselected(message.data);
        break;

      case 'selection_conflict':
        this.handleSelectionConflict(message.data);
        break;

      case 'reservation_created':
        console.log('📅 WebSocket received reservation_created message:', message.data);
        this.handleReservationCreated(message.data);
        break;

      case 'reservation_cancelled':
        this.handleReservationCancelled(message.data);
        break;

      case 'error':
        console.error('WebSocket error:', message.data.message);
        wsError.set(message.data.message);
        break;

      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  }

  /**
   * セル選択イベントの処理
   */
  handleCellSelecting(data) {
    const { date, timeSlotId, roomId, user, band } = data;
    const cellKey = `${date}-${timeSlotId}-${roomId}`;
    
    selectionStates.update(states => {
      const newStates = new Map(states);
      newStates.set(cellKey, { user, band, timestamp: Date.now() });
      console.log(`🗂️ selectionStates updated: key=${cellKey}, now has ${newStates.size} entries`);
      return newStates;
    });
    
    console.log(`👆 ${user.name}: selecting cell`);
  }

  /**
   * セル選択解除イベントの処理
   */
  handleCellDeselected(data) {
    const { date, timeSlotId, roomId } = data;
    const cellKey = `${date}-${timeSlotId}-${roomId}`;
    
    console.log(`🚫 handleCellDeselected: ${cellKey}`);
    
    selectionStates.update(states => {
      const newStates = new Map(states);
      const existed = newStates.has(cellKey);
      newStates.delete(cellKey);
      console.log(`🚫 Removed selection state: ${cellKey} (existed: ${existed}), now ${newStates.size} entries`);
      return newStates;
    });
    
    console.log(`👆 Selection cleared for ${cellKey}`);
  }

  /**
   * 選択競合の処理
   */
  handleSelectionConflict(data) {
    console.warn('Selection conflict:', data.message);
    alert(data.message);
  }

  /**
   * 予約作成イベントの処理
   */
  handleReservationCreated(data) {
    console.log(`📅 WebSocket handleReservationCreated called with data:`, data);
    console.log(`📅 ${data.user.name} created a reservation`);
    
    // 予約作成イベントを発火（親コンポーネントで処理）
    if (typeof window !== 'undefined') {
      console.log('📅 Dispatching reservation-created CustomEvent');
      window.dispatchEvent(new CustomEvent('reservation-created', { detail: data }));
      console.log('📅 CustomEvent dispatched successfully');
    } else {
      console.log('📅 Window is undefined, cannot dispatch event');
    }
  }

  /**
   * 予約キャンセルイベントの処理
   */
  handleReservationCancelled(data) {
    console.log(`🗑️ ${data.user.name} cancelled a reservation`);
    
    // 予約キャンセルイベントを発火（親コンポーネントで処理）
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reservation-cancelled', { detail: data }));
    }
  }
}

// シングルトンインスタンス
export const wsManager = new WebSocketManager();

// ブラウザ環境でのクリーンアップ
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    wsManager.disconnect();
  });
}