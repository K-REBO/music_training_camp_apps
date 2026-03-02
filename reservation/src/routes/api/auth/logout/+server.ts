import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';

export const POST: RequestHandler = async ({ cookies }) => {
  try {
    const sessionId = cookies.get('session_id');
    
    if (sessionId) {
      // セッション削除
      await dataService.deleteSession(sessionId);
    }
    
    // クッキー削除
    cookies.delete('session_id', {
      path: '/reservation'
    });
    
    return json({
      success: true,
      message: 'ログアウトしました'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    return json({
      success: false,
      error: 'サーバーエラーが発生しました'
    }, { status: 500 });
  }
};