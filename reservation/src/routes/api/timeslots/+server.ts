import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';

export const GET: RequestHandler = async () => {
  try {
    const timeSlots = await dataService.getTimeSlots();
    
    return json({
      success: true,
      data: timeSlots
    });
    
  } catch (error) {
    console.error('TimeSlots API error:', error);
    return json({
      success: false,
      error: 'Failed to fetch time slots'
    }, { status: 500 });
  }
};