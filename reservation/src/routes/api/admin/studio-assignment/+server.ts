import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';
import { requireAdmin } from '$lib/server/admin-guard';
import type { Reservation } from '$lib/types';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const authError = await requireAdmin(locals);
    if (authError) return authError;

    const body = await request.json();
    const { date, assignments } = body as {
      date: string;
      assignments: { timeSlotId: string; roomId: string; bandId: string }[];
    };

    if (!date || !Array.isArray(assignments)) {
      return json({ success: false, error: 'リクエストが不正です' }, { status: 400 });
    }

    const [rooms, allBands] = await Promise.all([
      dataService.getRooms(),
      dataService.getBands()
    ]);
    const bandMap = new Map(allBands.map(b => [b.id, b]));

    const created: Reservation[] = [];
    const failed: { timeSlotId: string; roomId: string; reason: string }[] = [];

    for (const assignment of assignments) {
      const { timeSlotId, roomId, bandId } = assignment;

      const band = bandMap.get(bandId);
      if (!band) {
        failed.push({ timeSlotId, roomId, reason: `バンドが見つかりません: ${bandId}` });
        continue;
      }

      const room = rooms.find(r => r.id === roomId);
      if (!room) {
        failed.push({ timeSlotId, roomId, reason: `部屋が見つかりません: ${roomId}` });
        continue;
      }

      try {
        const reservation = await dataService.createReservation({
          userId: locals.user!.id,
          userName: locals.user!.name,
          bandId: band.id,
          bandName: band.name,
          roomId,
          roomName: room.name,
          timeSlotId,
          date,
          status: 'active'
        });
        created.push(reservation);
      } catch (err) {
        const message = err instanceof Error ? err.message : '登録失敗';
        failed.push({ timeSlotId, roomId, reason: message });
      }
    }

    return json({ success: true, created, failed });
  } catch (error) {
    console.error('Studio assignment API error:', error);
    return json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
};
