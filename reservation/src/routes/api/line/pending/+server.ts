import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kv } from '$lib/server/kv-client';
import { dataService } from '$lib/server/data';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ success: false, error: '認証が必要です' }, { status: 401 });
  }
  const admin = await dataService.isAdmin(locals.user.id, locals.user.name);
  if (!admin) {
    return json({ success: false, error: '管理者権限が必要です' }, { status: 403 });
  }

  const entries = await kv.list(['line_pending']);
  const data = entries.map(e => e.value);
  return json({ success: true, data });
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ success: false, error: '認証が必要です' }, { status: 401 });
  }
  const admin = await dataService.isAdmin(locals.user.id, locals.user.name);
  if (!admin) {
    return json({ success: false, error: '管理者権限が必要です' }, { status: 403 });
  }

  const userId = url.searchParams.get('userId');
  if (!userId) {
    return json({ success: false, error: 'userIdが必要です' }, { status: 400 });
  }

  await kv.delete(['line_pending', userId]);
  return json({ success: true });
};
