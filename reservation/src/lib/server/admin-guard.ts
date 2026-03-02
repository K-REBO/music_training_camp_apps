import { json } from '@sveltejs/kit';
import { dataService } from './data.js';

/**
 * 管理者権限チェック。
 * 未認証なら 401、管理者でなければ 403 を返す。
 * 問題なければ null を返す。
 */
export async function requireAdmin(locals: App.Locals): Promise<Response | null> {
  if (!locals.user) {
    return json({ success: false, error: '認証が必要です' }, { status: 401 });
  }
  const admin = await dataService.isAdmin(locals.user.id, locals.user.name);
  if (!admin) {
    return json({ success: false, error: '管理者権限が必要です' }, { status: 403 });
  }
  return null;
}
