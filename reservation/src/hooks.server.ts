import type { Handle } from '@sveltejs/kit';
import { dataService } from '$lib/server/data';
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session_id');
  
  // セッション検証
  if (sessionId) {
    try {
      const session = await dataService.getSession(sessionId);
      if (session) {
        event.locals.user = {
          id: session.userId,
          name: session.userName,
          grade: session.grade
        };
      }
    } catch (error) {
      console.error('Session verification error:', error);
      // セッションが無効な場合はクッキーを削除
      event.cookies.delete('session_id', { path: '/' });
    }
  }
  
  // 認証が必要なページ
  const protectedPaths = ['/'];
  const isProtectedPath = protectedPaths.some(path => 
    event.url.pathname === path || event.url.pathname.startsWith(path + '/')
  );
  
  // APIエンドポイントとログインページは除外
  const isApiEndpoint = event.url.pathname.startsWith('/api/');
  const isLoginPage = event.url.pathname === '/login';
  const isStaticAsset = event.url.pathname.startsWith('/_app/') || 
                       event.url.pathname.startsWith('/static/');
  
  if (isProtectedPath && !event.locals.user && !isApiEndpoint && !isLoginPage && !isStaticAsset) {
    throw redirect(302, `${base}/login?redirect=${encodeURIComponent(event.url.pathname)}`);
  }
  
  // ログイン済みユーザーがログインページにアクセスした場合
  if (isLoginPage && event.locals.user) {
    throw redirect(302, base || '/');
  }
  
  const response = await resolve(event);
  return response;
};;