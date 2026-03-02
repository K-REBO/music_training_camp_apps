import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';
import { requireAdmin } from '$lib/server/admin-guard';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const authError = await requireAdmin(locals);
  if (authError) return authError;

  try {
    const { name } = await request.json();
    if (!name?.trim()) {
      return json({ success: false, error: '部屋名を入力してください' }, { status: 400 });
    }
    const rooms = await dataService.updateRoomName(params.id, name.trim());
    return json({ success: true, data: rooms });
  } catch (error) {
    console.error('Rooms PUT error:', error);
    return json({ success: false, error: error.message || 'サーバーエラーが発生しました' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ locals }) => {
  const authError = await requireAdmin(locals);
  if (authError) return authError;

  try {
    const rooms = await dataService.deleteLastStudioRoom();
    return json({ success: true, data: rooms });
  } catch (error) {
    console.error('Rooms DELETE error:', error);
    return json({ success: false, error: error.message || 'サーバーエラーが発生しました' }, { status: 500 });
  }
};
