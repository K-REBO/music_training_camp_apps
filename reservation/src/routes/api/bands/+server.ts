import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';
import { requireAdmin } from '$lib/server/admin-guard';

export const GET: RequestHandler = async () => {
  try {
    const bands = await dataService.getBands();

    // バンドメンバー重複チェックのためメンバー名も含める
    const sanitizedBands = bands.map(band => ({
      id: band.id,
      name: band.name,
      members: band.members, // 重複チェックに必要
      memberIds: band.memberIds,
      createdAt: band.createdAt
    }));

    return json({
      success: true,
      data: sanitizedBands
    });

  } catch (error) {
    console.error('Bands API error:', error);
    return json({
      success: false,
      error: 'Failed to fetch bands'
    }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const authError = await requireAdmin(locals);
  if (authError) return authError;

  try {
    const { name, members, memberIds } = await request.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return json({ success: false, error: 'バンド名は必須です' }, { status: 400 });
    }

    const existing = await dataService.getBandByName(name.trim());
    if (existing) {
      return json({ success: false, error: '同名のバンドが既に存在します' }, { status: 409 });
    }

    const band = await dataService.createBand({
      name: name.trim(),
      members: members || {},
      memberIds: memberIds || []
    });

    return json({ success: true, data: band }, { status: 201 });
  } catch (error) {
    console.error('Bands POST error:', error);
    return json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
};