import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';
import { requireAdmin } from '$lib/server/admin-guard';

export const GET: RequestHandler = async ({ locals }) => {
  const authError = await requireAdmin(locals);
  if (authError) return authError;

  try {
    const members = await dataService.getMembers();
    return json({ success: true, data: members });
  } catch (error) {
    console.error('Members GET error:', error);
    return json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const authError = await requireAdmin(locals);
  if (authError) return authError;

  try {
    const { name, grade } = await request.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return json({ success: false, error: '名前は必須です' }, { status: 400 });
    }
    if (!grade || typeof grade !== 'string' || !grade.trim()) {
      return json({ success: false, error: '学年は必須です' }, { status: 400 });
    }

    const existing = await dataService.getMemberByNameAndGrade(name.trim(), grade.trim());
    if (existing) {
      return json({ success: false, error: '同名・同学年のメンバーが既に存在します' }, { status: 409 });
    }

    const member = await dataService.createMember({ name: name.trim(), grade: grade.trim() });
    return json({ success: true, data: member }, { status: 201 });
  } catch (error) {
    console.error('Members POST error:', error);
    return json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
};
