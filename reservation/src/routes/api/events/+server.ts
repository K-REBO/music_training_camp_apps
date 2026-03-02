import type { RequestHandler } from './$types';
import { addConnection, removeConnection } from '$lib/server/sse-manager.js';

export const GET: RequestHandler = async ({ locals }) => {
  // 認証チェック
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const stream = new ReadableStream({
    start(controller) {
      // 接続を登録
      addConnection(controller);
      
      // 初期接続メッセージ
      const welcomeMessage = `data: ${JSON.stringify({
        type: 'connected',
        userId: locals.user.id,
        userName: locals.user.name
      })}\n\n`;
      
      controller.enqueue(new TextEncoder().encode(welcomeMessage));
    },
    cancel() {
      // 接続終了時にクリーンアップ
      removeConnection(controller);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  });
};