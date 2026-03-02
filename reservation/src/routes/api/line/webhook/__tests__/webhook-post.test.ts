import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('$lib/server/kv-client', () => ({
  kv: {
    set: vi.fn().mockResolvedValue(undefined),
  }
}));

import { POST } from '../+server';
import { kv } from '$lib/server/kv-client';

const SECRET = 'test-channel-secret';
const ACCESS_TOKEN = 'test-access-token';

function makeSignature(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('base64');
}

function makeRequest(body: string, signature?: string): Request {
  return new Request('http://localhost/api/line/webhook', {
    method: 'POST',
    body,
    headers: signature ? { 'x-line-signature': signature } : {},
  });
}

describe('POST /api/line/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LINE_CHANNEL_SECRET = SECRET;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = ACCESS_TOKEN;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ displayName: 'テストユーザー' })
    }));
  });

  it('署名がない場合は400を返す', async () => {
    const body = JSON.stringify({ events: [] });
    const res = await POST({ request: makeRequest(body) } as any);
    expect(res.status).toBe(400);
  });

  it('署名が間違っている場合は400を返す', async () => {
    const body = JSON.stringify({ events: [] });
    const res = await POST({ request: makeRequest(body, 'invalid-signature') } as any);
    expect(res.status).toBe(400);
  });

  it('正しい署名でイベントなしの場合は200を返す', async () => {
    const body = JSON.stringify({ events: [] });
    const res = await POST({ request: makeRequest(body, makeSignature(body)) } as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('followイベントでKVにユーザーを保存する', async () => {
    const lineUserId = 'Uabcdef1234567890';
    const displayName = '山田太郎';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ displayName })
    }));

    const body = JSON.stringify({
      events: [{ type: 'follow', source: { userId: lineUserId } }]
    });

    await POST({ request: makeRequest(body, makeSignature(body)) } as any);

    expect(kv.set).toHaveBeenCalledWith(
      ['line_pending', lineUserId],
      expect.objectContaining({ lineUserId, displayName })
    );
  });

  it('messageイベントでKVにユーザーを保存する', async () => {
    const lineUserId = 'Uabcdef1234567890';
    const body = JSON.stringify({
      events: [{ type: 'message', source: { userId: lineUserId } }]
    });

    await POST({ request: makeRequest(body, makeSignature(body)) } as any);

    expect(kv.set).toHaveBeenCalledWith(
      ['line_pending', lineUserId],
      expect.objectContaining({ lineUserId })
    );
  });

  it('unfollowイベントは無視する', async () => {
    const body = JSON.stringify({
      events: [{ type: 'unfollow', source: { userId: 'Uxxx' } }]
    });

    await POST({ request: makeRequest(body, makeSignature(body)) } as any);

    expect(kv.set).not.toHaveBeenCalled();
  });

  it('userIdがないイベントは無視する', async () => {
    const body = JSON.stringify({
      events: [{ type: 'follow', source: {} }]
    });

    await POST({ request: makeRequest(body, makeSignature(body)) } as any);

    expect(kv.set).not.toHaveBeenCalled();
  });

  it('receivedAtをISO文字列で保存する', async () => {
    const lineUserId = 'Uabcdef1234567890';
    const body = JSON.stringify({
      events: [{ type: 'follow', source: { userId: lineUserId } }]
    });

    await POST({ request: makeRequest(body, makeSignature(body)) } as any);

    expect(kv.set).toHaveBeenCalledWith(
      ['line_pending', lineUserId],
      expect.objectContaining({
        receivedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      })
    );
  });
});
