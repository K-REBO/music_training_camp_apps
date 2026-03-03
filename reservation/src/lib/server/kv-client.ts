/**
 * KV Client for SvelteKit
 * HTTP経由でKVサーバー（Deno または Rust）と通信
 * KV_SERVER_URL 環境変数で切り替え可能
 */

// 環境変数 KV_SERVER_URL が設定されている場合はそちらを優先（Rust への移行時に使用）
const KV_SERVER_URL = (typeof process !== 'undefined' && process.env?.KV_SERVER_URL) || 'http://127.0.0.1:8001';

export class KVClient {
  private baseUrl: string;

  constructor(baseUrl: string = KV_SERVER_URL) {
    this.baseUrl = baseUrl;
  }

  async get(key: string[]): Promise<{ value: any; versionstamp?: string }> {
    const keyPath = key.join('/');
    const response = await fetch(`${this.baseUrl}/api/kv/${keyPath}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get value');
    }
    
    return { value: result.data, versionstamp: null };
  }

  async set(key: string[], value: any): Promise<void> {
    const keyPath = key.join('/');
    const response = await fetch(`${this.baseUrl}/api/kv/${keyPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to set value');
    }
  }

  async delete(key: string[]): Promise<void> {
    const keyPath = key.join('/');
    const response = await fetch(`${this.baseUrl}/api/kv/${keyPath}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete value');
    }
  }

  async list(prefix: string[]): Promise<Array<{ key: string[]; value: any }>> {
    const prefixPath = prefix.join('/');
    const response = await fetch(`${this.baseUrl}/api/kv/list/${prefixPath}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to list values');
    }
    
    // null安全処理
    if (!result.data || !Array.isArray(result.data)) {
      console.warn(`KV list for prefix [${prefixPath}] returned invalid data:`, result.data);
      return [];
    }
    
    return result.data;
  }

  async atomicUpdate(key: string[], expectedVersion: number, newValue: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/kv/atomic`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        expectedVersion,
        newValue
      })
    });
    
    const result = await response.json();
    
    if (!result.success) {
      if (response.status === 409) {
        // Preserve the actual error message from the server for 409 conflicts
        throw new Error(result.error || 'CONFLICT');
      }
      throw new Error(result.error || 'Failed to update value');
    }
    
    return result.data;
  }
}

export const kv = new KVClient();