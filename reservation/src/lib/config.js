/**
 * Environment Configuration
 * 環境設定ファイル
 */

import { base } from '$app/paths';

// 環境判定
export const isDevelopment = () => {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');
};

// WebSocket URL の生成
export const getWebSocketUrl = () => {
  if (typeof window === 'undefined') return '';
  
  if (isDevelopment()) {
    // ローカル開発環境
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    return `${protocol}//${host}:8001/ws`;
  } else {
    // 本番環境 - Cloudflare経由でWebSocket接続
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }
};

// API Base URL の生成
export const getApiBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  
  if (isDevelopment()) {
    // ローカル開発環境
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    return `${protocol}//${host}:8001/api`;
  } else {
    // 本番環境
    return `${window.location.origin}${base}/api`;
  }
};

export const config = {
  isDevelopment: isDevelopment(),
  websocketUrl: getWebSocketUrl(),
  apiBaseUrl: getApiBaseUrl(),
};