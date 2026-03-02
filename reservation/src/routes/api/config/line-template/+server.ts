import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kv } from '$lib/server/kv-client';
import { dataService } from '$lib/server/data';
import { DEFAULT_LINE_TEMPLATE } from '$lib/server/line-template';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ success: false, error: '認証が必要です' }, { status: 401 });
  const admin = await dataService.isAdmin(locals.user.id, locals.user.name);
  if (!admin) return json({ success: false, error: '管理者権限が必要です' }, { status: 403 });

  const result = await kv.get(['config', 'line_template']);
  const template = (result.value as string) || DEFAULT_LINE_TEMPLATE;
  return json({ success: true, template });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ success: false, error: '認証が必要です' }, { status: 401 });
  const admin = await dataService.isAdmin(locals.user.id, locals.user.name);
  if (!admin) return json({ success: false, error: '管理者権限が必要です' }, { status: 403 });

  const { template } = await request.json();
  if (!template || !template.trim()) {
    return json({ success: false, error: 'テンプレートを入力してください' }, { status: 400 });
  }

  await kv.set(['config', 'line_template'], template);
  return json({ success: true, template });
};
