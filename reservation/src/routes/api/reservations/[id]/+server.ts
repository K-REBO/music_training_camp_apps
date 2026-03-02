import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';
import { broadcastChange } from '$lib/server/sse-manager.js';
import { serverWsClient } from '$lib/server/ws-client.js';

/**
 * 予約キャンセル権限をチェック
 * @param user ログインユーザー
 * @param reservation 対象予約
 * @returns キャンセル可能かどうか
 */
async function checkCancelPermission(user: any, reservation: any): Promise<boolean> {
  // 0. 椎木知仁は全ての予約を削除可能
  if (user.name === '椎木知仁') {
    return true;
  }
  
  // 1. 予約者本人は常にキャンセル可能
  if (reservation.userId === user.id) {
    return true;
  }
  
  // 2. 個人枠の場合は予約者本人のみ
  if (reservation.bandId?.startsWith('personal_')) {
    return false;
  }
  
  // 3. バンド枠の場合：バンドメンバーならキャンセル可能
  const band = await dataService.getBand(reservation.bandId);
  if (band && band.memberIds.includes(user.id)) {
    return true;
  }
  
  return false;
}

export const DELETE: RequestHandler = async ({ params, locals, url }) => {
  try {
    if (!locals.user) {
      return json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    const reservationId = params.id;
    const date = url.searchParams.get('date');
    const roomId = url.searchParams.get('roomId');
    const timeSlotId = url.searchParams.get('timeSlotId');
    const expectedVersion = parseInt(url.searchParams.get('version') || '1');
    
    if (!reservationId || !date || !roomId || !timeSlotId) {
      return json({
        success: false,
        error: 'Missing required parameters'
      }, { status: 400 });
    }
    
    // 予約の詳細を取得して権限チェック
    const reservation = await dataService.getReservation(date, roomId, timeSlotId);
    
    if (!reservation) {
      return json({
        success: false,
        error: '予約が見つかりません'
      }, { status: 404 });
    }
    
    // キャンセル権限チェック
    const canCancel = await checkCancelPermission(locals.user, reservation);
    
    if (!canCancel) {
      return json({
        success: false,
        error: 'この予約をキャンセルする権限がありません'
      }, { status: 403 });
    }
    
    // 予約をキャンセル
    await dataService.cancelReservation(date, roomId, timeSlotId, expectedVersion);
    
    // 他のクライアントにリアルタイム通知（SSE）
    broadcastChange({
      type: 'reservation_cancelled',
      data: {
        reservationId,
        date,
        roomId,
        timeSlotId,
        user: {
          id: locals.user.id,
          name: locals.user.name
        }
      }
    });

    // WebSocketサーバーにも通知（リアルタイムUI更新のため）
    serverWsClient.notifyReservationCancelled({
      date,
      reservationId,
      user: {
        id: locals.user.id,
        name: locals.user.name
      }
    });
    
    return json({
      success: true,
      message: 'Reservation cancelled'
    });
    
  } catch (error) {
    console.error('Reservation DELETE API error:', error);
    
    if (error.message.includes('予約が見つかりません')) {
      return json({
        success: false,
        error: '予約が見つかりません'
      }, { status: 404 });
    }
    
    return json({
      success: false,
      error: 'Failed to cancel reservation'
    }, { status: 500 });
  }
};