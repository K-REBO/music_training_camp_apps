import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/kv-client', () => ({
  kv: {
    delete: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  }
}));

vi.mock('$lib/server/data', () => ({
  dataService: {
    isAdmin: vi.fn(),
    getMember: vi.fn(),
    getMemberByNameAndGrade: vi.fn(),
    updateMember: vi.fn(),
  }
}));

import { PUT } from '../+server';
import { kv } from '$lib/server/kv-client';
import { dataService } from '$lib/server/data';

const OLD_LINE_USER_ID = 'Uold123';
const OLD_DISPLAY_NAME = '山田太郎';

const ADMIN_USER = { id: 'admin1', name: 'Admin' };
const EXISTING_MEMBER = {
  id: 'member1',
  name: '田中花子',
  grade: '中大1年',
  lineUserId: undefined,
};

function makeRequest(body: object): Request {
  return new Request('http://localhost/api/members/member1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PUT /api/members/[id] - LINE pending削除', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataService.isAdmin).mockResolvedValue(true);
    vi.mocked(dataService.getMember).mockResolvedValue({ ...EXISTING_MEMBER });
    vi.mocked(dataService.getMemberByNameAndGrade).mockResolvedValue(null);
    vi.mocked(dataService.updateMember).mockResolvedValue({
      ...EXISTING_MEMBER,
      lineUserId: 'Unew123'
    });
  });

  it('lineUserIdが新規設定された時にpendingを削除する', async () => {
    const newLineUserId = 'Unew123';
    const res = await PUT({
      params: { id: 'member1' },
      request: makeRequest({ lineUserId: newLineUserId }),
      locals: { user: ADMIN_USER }
    } as any);

    expect(res.status).toBe(200);
    expect(kv.delete).toHaveBeenCalledWith(['line_pending', newLineUserId]);
  });

  it('lineUserIdが変更された時にpendingを削除する', async () => {
    vi.mocked(dataService.getMember).mockResolvedValue({
      ...EXISTING_MEMBER,
      lineUserId: 'Uold123'
    });
    vi.mocked(dataService.updateMember).mockResolvedValue({
      ...EXISTING_MEMBER,
      lineUserId: 'Unew456'
    });

    const newLineUserId = 'Unew456';
    const res = await PUT({
      params: { id: 'member1' },
      request: makeRequest({ lineUserId: newLineUserId }),
      locals: { user: ADMIN_USER }
    } as any);

    expect(res.status).toBe(200);
    expect(kv.delete).toHaveBeenCalledWith(['line_pending', newLineUserId]);
  });

  it('lineUserIdが変わらない時はpendingを削除しない', async () => {
    const sameLineUserId = 'Usame123';
    vi.mocked(dataService.getMember).mockResolvedValue({
      ...EXISTING_MEMBER,
      lineUserId: sameLineUserId
    });
    vi.mocked(dataService.updateMember).mockResolvedValue({
      ...EXISTING_MEMBER,
      lineUserId: sameLineUserId
    });

    const res = await PUT({
      params: { id: 'member1' },
      request: makeRequest({ lineUserId: sameLineUserId }),
      locals: { user: ADMIN_USER }
    } as any);

    expect(res.status).toBe(200);
    expect(kv.delete).not.toHaveBeenCalled();
  });

  it('lineUserIdが空（削除）の時はpendingを削除しない', async () => {
    vi.mocked(dataService.getMember).mockResolvedValue({
      ...EXISTING_MEMBER,
      lineUserId: 'Uold123'
    });
    vi.mocked(dataService.updateMember).mockResolvedValue({
      ...EXISTING_MEMBER,
      lineUserId: undefined
    });

    const res = await PUT({
      params: { id: 'member1' },
      request: makeRequest({ lineUserId: '' }),
      locals: { user: ADMIN_USER }
    } as any);

    expect(res.status).toBe(200);
    expect(kv.delete).not.toHaveBeenCalled();
  });
});

describe('PUT /api/members/[id] - lineUserId削除時にpending復元', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataService.isAdmin).mockResolvedValue(true);
    vi.mocked(dataService.getMember).mockResolvedValue({
      ...EXISTING_MEMBER,
      lineUserId: OLD_LINE_USER_ID,
    });
    vi.mocked(dataService.getMemberByNameAndGrade).mockResolvedValue(null);
    vi.mocked(dataService.updateMember).mockResolvedValue({
      ...EXISTING_MEMBER,
      lineUserId: undefined,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ displayName: OLD_DISPLAY_NAME })
    }));
  });

  it('lineUserIdを空にした時にpendingを復元する', async () => {
    const res = await PUT({
      params: { id: 'member1' },
      request: makeRequest({ lineUserId: '' }),
      locals: { user: ADMIN_USER }
    } as any);

    expect(res.status).toBe(200);
    expect(kv.set).toHaveBeenCalledWith(
      ['line_pending', OLD_LINE_USER_ID],
      expect.objectContaining({ lineUserId: OLD_LINE_USER_ID, displayName: OLD_DISPLAY_NAME })
    );
  });

  it('lineUserIdがない（未登録）メンバーをクリアしてもpendingを復元しない', async () => {
    vi.mocked(dataService.getMember).mockResolvedValue({
      ...EXISTING_MEMBER,
      lineUserId: undefined,
    });

    const res = await PUT({
      params: { id: 'member1' },
      request: makeRequest({ lineUserId: '' }),
      locals: { user: ADMIN_USER }
    } as any);

    expect(res.status).toBe(200);
    expect(kv.set).not.toHaveBeenCalled();
  });
});
