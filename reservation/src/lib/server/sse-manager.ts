/**
 * Server-Sent Events Manager
 * SvelteKitルート外でSSE接続を管理
 */

// アクティブな接続を管理
const connections = new Set<ReadableStreamDefaultController>();

// 変更通知を全クライアントに送信
export function broadcastChange(event: { type: string; data: any }) {
  const message = `data: ${JSON.stringify(event)}\n\n`;
  
  // 切断された接続をクリーンアップ
  const toRemove: ReadableStreamDefaultController[] = [];
  
  for (const controller of connections) {
    try {
      controller.enqueue(new TextEncoder().encode(message));
    } catch (error) {
      // 接続が切断された場合
      toRemove.push(controller);
    }
  }
  
  // 無効な接続を削除
  toRemove.forEach(controller => connections.delete(controller));
  
  console.log(`📡 Broadcasting to ${connections.size} clients:`, event);
}

export function addConnection(controller: ReadableStreamDefaultController) {
  connections.add(controller);
  console.log(`🔗 New SSE connection added (${connections.size} total)`);
}

export function removeConnection(controller: ReadableStreamDefaultController) {
  connections.delete(controller);
  console.log(`🔌 SSE connection removed (${connections.size} remaining)`);
}