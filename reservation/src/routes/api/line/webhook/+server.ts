import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kv } from '$lib/server/kv-client';
import { verifyLineSignature } from '$lib/server/line-utils';

export const POST: RequestHandler = async ({ request }) => {
  const signature = request.headers.get('x-line-signature');
  const rawBody = await request.text();

  if (!signature || !verifyLineSignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET!)) {
    return json({}, { status: 400 });
  }

  const body = JSON.parse(rawBody);
  for (const event of body.events ?? []) {
    if (!['follow', 'message'].includes(event.type)) continue;
    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;

    const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    const { displayName } = await profileRes.json();

    await kv.set(['line_pending', lineUserId], {
      lineUserId,
      displayName,
      receivedAt: new Date().toISOString()
    });
  }

  return json({ success: true });
};
