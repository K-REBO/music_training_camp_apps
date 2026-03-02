import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';

export const DELETE: RequestHandler = async ({ locals }) => {
  try {
    if (!locals.user) {
      return json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    // 合宿係のメンバーのみ実行可能
    const campOrganizerBand = await dataService.getBandByName('合宿係');
    const isCampOrganizer = campOrganizerBand && campOrganizerBand.memberIds.includes(locals.user.id);
    
    if (!isCampOrganizer) {
      return json({
        success: false,
        error: '合宿係のメンバーのみ実行可能です'
      }, { status: 403 });
    }

    // 全予約データを削除
    await dataService.clearAllReservations();
    
    return json({
      success: true,
      message: '全予約データを削除しました'
    });
    
  } catch (error) {
    console.error('Clear reservations API error:', error);
    return json({
      success: false,
      error: 'Failed to clear reservations'
    }, { status: 500 });
  }
};