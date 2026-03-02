import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig, isFeatureEnabled } from '$lib/server/config';

export const GET: RequestHandler = async () => {
  try {
    const config = await getConfig();
    const bandMemberFiltering = await isFeatureEnabled('band_member_filtering');
    
    return json({
      success: true,
      data: {
        app: config.app,
        features: {
          band_member_filtering: bandMemberFiltering
        },
        reservation: {
          confirmation_delay_seconds: config.reservation.confirmation_delay_seconds,
          max_reservations_per_user: config.reservation.max_reservations_per_user
        },
        schedule: config.schedule,
        rooms: config.rooms,
        restrictions: config.restrictions
      }
    });
    
  } catch (error) {
    console.error('Config API error:', error);
    return json({
      success: false,
      error: 'Failed to load configuration'
    }, { status: 500 });
  }
};