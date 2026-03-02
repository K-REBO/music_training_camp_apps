import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';
import { requireAdmin } from '$lib/server/admin-guard';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const authError = await requireAdmin(locals);
  if (authError) return authError;

  try {
    const { id } = params;
    const { name, members, memberIds } = await request.json();

    const current = await dataService.getBand(id);
    if (!current) {
      return json({ success: false, error: 'バンドが見つかりません' }, { status: 404 });
    }

    if (name && name.trim() !== current.name) {
      const existing = await dataService.getBandByName(name.trim());
      if (existing) {
        return json({ success: false, error: '同名のバンドが既に存在します' }, { status: 409 });
      }
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (members !== undefined) updates.members = members;
    if (memberIds !== undefined) updates.memberIds = memberIds;

    const updated = await dataService.updateBand(id, updates);
    return json({ success: true, data: updated });
  } catch (error) {
    console.error('Bands PUT error:', error);
    return json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const authError = await requireAdmin(locals);
  if (authError) return authError;

  try {
    const { id } = params;
    const current = await dataService.getBand(id);
    if (!current) {
      return json({ success: false, error: 'バンドが見つかりません' }, { status: 404 });
    }

    await dataService.deleteBand(id);
    return json({ success: true });
  } catch (error) {
    console.error('Bands DELETE error:', error);
    return json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
};
