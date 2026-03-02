import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/kv-client', () => ({
  kv: {
    list: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}));

vi.mock('$lib/server/data', () => ({
  dataService: {
    isAdmin: vi.fn(),
  }
}));

import { GET, DELETE } from '../+server';
import { kv } from '$lib/server/kv-client';
import { dataService } from '$lib/server/data';

const ADMIN_USER = { id: 'admin1', name: 'Admin' };
const REGULAR_USER = { id: 'user1', name: 'Regular' };

describe('GET /api/line/pending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未認証の場合は401を返す', async () => {
    const res = await GET({
      locals: { user: null },
      url: new URL('http://localhost/api/line/pending')
    } as any);
    expect(res.status).toBe(401);
  });

  it('管理者でない場合は403を返す', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(false);
    const res = await GET({
      locals: { user: REGULAR_USER },
      url: new URL('http://localhost/api/line/pending')
    } as any);
    expect(res.status).toBe(403);
  });

  it('管理者にはpendingリストを返す', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(true);
    vi.mocked(kv.list).mockResolvedValue([
      {
        key: ['line_pending', 'U123'],
        value: { lineUserId: 'U123', displayName: '山田太郎', receivedAt: '2024-01-01T00:00:00.000Z' }
      }
    ]);

    const res = await GET({
      locals: { user: ADMIN_USER },
      url: new URL('http://localhost/api/line/pending')
    } as any);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].lineUserId).toBe('U123');
    expect(data.data[0].displayName).toBe('山田太郎');
  });

  it('pendingがない場合は空配列を返す', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(true);
    vi.mocked(kv.list).mockResolvedValue([]);

    const res = await GET({
      locals: { user: ADMIN_USER },
      url: new URL('http://localhost/api/line/pending')
    } as any);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toHaveLength(0);
  });
});

describe('DELETE /api/line/pending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未認証の場合は401を返す', async () => {
    const res = await DELETE({
      locals: { user: null },
      url: new URL('http://localhost/api/line/pending?userId=U123')
    } as any);
    expect(res.status).toBe(401);
  });

  it('管理者でない場合は403を返す', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(false);
    const res = await DELETE({
      locals: { user: REGULAR_USER },
      url: new URL('http://localhost/api/line/pending?userId=U123')
    } as any);
    expect(res.status).toBe(403);
  });

  it('userIdがない場合は400を返す', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(true);
    const res = await DELETE({
      locals: { user: ADMIN_USER },
      url: new URL('http://localhost/api/line/pending')
    } as any);
    expect(res.status).toBe(400);
  });

  it('管理者はpendingエントリを削除できる', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(true);
    const res = await DELETE({
      locals: { user: ADMIN_USER },
      url: new URL('http://localhost/api/line/pending?userId=U123')
    } as any);
    expect(res.status).toBe(200);
    expect(kv.delete).toHaveBeenCalledWith(['line_pending', 'U123']);
  });
});
