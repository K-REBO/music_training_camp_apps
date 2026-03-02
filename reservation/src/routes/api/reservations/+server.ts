import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';
import { broadcastChange } from '$lib/server/sse-manager.js';
import { serverWsClient } from '$lib/server/ws-client.js';

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const date = url.searchParams.get('date');
    
    if (!date) {
      return json({
        success: false,
        error: 'Date parameter is required'
      }, { status: 400 });
    }
    
    const reservations = await dataService.getReservations(date);
    
    return json({
      success: true,
      data: reservations
    });
    
  } catch (error) {
    console.error('Reservations GET API error:', error);
    return json({
      success: false,
      error: 'Failed to fetch reservations'
    }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    if (!locals.user) {
      return json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    const { timeSlotId, roomId, bandId, date, eventName, description } = await request.json();
    
    if (!timeSlotId || !roomId || !bandId || !date) {
      return json({
        success: false,
        error: 'All fields are required'
      }, { status: 400 });
    }
    
    // バンド情報を取得（個人予約の場合は特別処理）
    let band = null;
    let isPersonalReservation = false;
    
    if (bandId.startsWith('personal_')) {
      // 個人予約の場合
      isPersonalReservation = true;
      band = {
        id: bandId,
        name: `個人枠: ${locals.user.name}`,
        isPersonal: true,
        members: { '個人': locals.user.name },
        memberIds: [locals.user.id]
      };
    } else {
      // 通常のバンド予約の場合
      band = await dataService.getBand(bandId);
      if (!band) {
        return json({
          success: false,
          error: 'Band not found'
        }, { status: 404 });
      }
    }
    
    // 部屋とタイムスロット情報も取得（表示用）
    const [rooms, timeSlots] = await Promise.all([
      dataService.getRooms(),
      dataService.getTimeSlots()
    ]);
    
    const room = rooms.find(r => r.id === roomId);
    const timeSlot = timeSlots.find(ts => ts.id === timeSlotId);
    
    if (!room || !timeSlot) {
      return json({
        success: false,
        error: 'Room or time slot not found'
      }, { status: 404 });
    }
    
    
    const reservation = await dataService.createReservation({
      userId: locals.user.id,
      userName: locals.user.name,
      bandId: band.id,
      bandName: band.name,
      roomId: room.id,
      roomName: room.name,
      timeSlotId: timeSlot.id,
      date,
      status: 'active',
      isPersonal: isPersonalReservation,
      eventName: eventName || undefined,
      description: description || undefined
    });
    
    // 他のクライアントにリアルタイム通知（SSE）
    broadcastChange({
      type: 'reservation_created',
      data: {
        reservation,
        date,
        user: {
          id: locals.user.id,
          name: locals.user.name
        }
      }
    });

    // WebSocketサーバーにも通知（リアルタイムUI更新のため）
    serverWsClient.notifyReservationCreated({
      date,
      timeSlotId,
      roomId,
      reservation,
      user: {
        id: locals.user.id,
        name: locals.user.name
      }
    });
    
    return json({
      success: true,
      data: reservation
    });
    
  } catch (error) {
    console.error('Reservations POST API error:', error);
    
    if (error.message.includes('この時間枠は既に予約されています')) {
      return json({
        success: false,
        error: error.message
      }, { status: 409 });
    }
    
    return json({
      success: false,
      error: 'Failed to create reservation'
    }, { status: 500 });
  }
};