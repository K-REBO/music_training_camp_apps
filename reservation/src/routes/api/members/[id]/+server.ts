import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';
import { kv } from '$lib/server/kv-client';
import { requireAdmin } from '$lib/server/admin-guard';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const authError = await requireAdmin(locals);
  if (authError) return authError;

  try {
    const { id } = params;
    const { name, grade, lineUserId } = await request.json();

    const current = await dataService.getMember(id);
    if (!current) {
      return json({ success: false, error: 'メンバーが見つかりません' }, { status: 404 });
    }

    const newName = name !== undefined ? name.trim() : current.name;
    const newGrade = grade !== undefined ? grade.trim() : current.grade;
    const newLineUserId = lineUserId !== undefined
      ? (lineUserId.trim() || undefined)
      : current.lineUserId;

    if (newName !== current.name || newGrade !== current.grade) {
      const existing = await dataService.getMemberByNameAndGrade(newName, newGrade);
      if (existing && existing.id !== id) {
        return json({ success: false, error: '同名・同学年のメンバーが既に存在します' }, { status: 409 });
      }
    }

    const updated = await dataService.updateMember(id, {
      name: newName,
      grade: newGrade,
      lineUserId: newLineUserId,
    });

    if (newLineUserId && newLineUserId !== current.lineUserId) {
      await kv.delete(['line_pending', newLineUserId]);
    }

    if (!newLineUserId && current.lineUserId) {
      const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${current.lineUserId}`, {
        headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` }
      });
      const { displayName } = await profileRes.json();
      await kv.set(['line_pending', current.lineUserId], {
        lineUserId: current.lineUserId,
        displayName,
        receivedAt: new Date().toISOString(),
      });
    }

    return json({ success: true, data: updated });
  } catch (error) {
    console.error('Members PUT error:', error);
    return json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const authError = await requireAdmin(locals);
  if (authError) return authError;

  try {
    const { id } = params;
    const current = await dataService.getMember(id);
    if (!current) {
      return json({ success: false, error: 'メンバーが見つかりません' }, { status: 404 });
    }

    await dataService.deleteMember(id);
    return json({ success: true });
  } catch (error) {
    console.error('Members DELETE error:', error);
    return json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
};
