import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';

export const GET: RequestHandler = async ({ locals }) => {
  try {
    if (!locals.user) {
      return json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const feedback = await dataService.getFeedback();
    
    return json({
      success: true,
      data: feedback
    });
    
  } catch (error) {
    console.error('Feedback GET API error:', error);
    return json({
      success: false,
      error: 'Failed to fetch feedback'
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
    
    const { type, title, description, priority } = await request.json();
    
    if (!type || !title || !description) {
      return json({
        success: false,
        error: 'タイプ、タイトル、説明は必須です'
      }, { status: 400 });
    }
    
    const feedback = await dataService.createFeedback({
      userId: locals.user.id,
      userName: locals.user.name,
      type,
      title,
      description,
      priority: priority || 'medium'
    });
    
    return json({
      success: true,
      data: feedback
    });
    
  } catch (error) {
    console.error('Feedback POST API error:', error);
    return json({
      success: false,
      error: 'Failed to create feedback'
    }, { status: 500 });
  }
};