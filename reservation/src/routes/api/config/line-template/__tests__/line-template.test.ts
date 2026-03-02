import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/kv-client', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
  }
}));

vi.mock('$lib/server/data', () => ({
  dataService: {
    isAdmin: vi.fn(),
  }
}));

import { GET, PUT } from '../+server';
import { applyTemplate } from '$lib/server/line-template';
import { kv } from '$lib/server/kv-client';
import { dataService } from '$lib/server/data';

const ADMIN_USER = { id: 'admin1', name: 'Admin' };
const REGULAR_USER = { id: 'user1', name: 'User' };
const DEFAULT_TEMPLATE = '{room}の練習時間が10分後に始まります！準備してください🎸';

describe('GET /api/config/line-template', () => {
  beforeEach(() => vi.clearAllMocks());

  it('未認証は401', async () => {
    const res = await GET({ locals: { user: null } } as any);
    expect(res.status).toBe(401);
  });

  it('非管理者は403', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(false);
    const res = await GET({ locals: { user: REGULAR_USER } } as any);
    expect(res.status).toBe(403);
  });

  it('KVに値がなければデフォルトを返す', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(true);
    vi.mocked(kv.get).mockResolvedValue({ value: null });

    const res = await GET({ locals: { user: ADMIN_USER } } as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.template).toBe(DEFAULT_TEMPLATE);
  });

  it('KVに保存済みのテンプレートを返す', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(true);
    vi.mocked(kv.get).mockResolvedValue({ value: '{band}が{room}で{hour}時から！' });

    const res = await GET({ locals: { user: ADMIN_USER } } as any);
    const data = await res.json();
    expect(data.template).toBe('{band}が{room}で{hour}時から！');
  });
});

describe('PUT /api/config/line-template', () => {
  beforeEach(() => vi.clearAllMocks());

  it('未認証は401', async () => {
    const res = await PUT({
      locals: { user: null },
      request: new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ template: 'x' }) })
    } as any);
    expect(res.status).toBe(401);
  });

  it('非管理者は403', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(false);
    const res = await PUT({
      locals: { user: REGULAR_USER },
      request: new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ template: 'x' }) })
    } as any);
    expect(res.status).toBe(403);
  });

  it('空文字は400', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(true);
    const res = await PUT({
      locals: { user: ADMIN_USER },
      request: new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ template: '' }) })
    } as any);
    expect(res.status).toBe(400);
  });

  it('有効なテンプレートをKVに保存する', async () => {
    vi.mocked(dataService.isAdmin).mockResolvedValue(true);
    const template = '{band}が{room}で{hour}時から練習！';

    const res = await PUT({
      locals: { user: ADMIN_USER },
      request: new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ template }) })
    } as any);

    expect(res.status).toBe(200);
    expect(kv.set).toHaveBeenCalledWith(['config', 'line_template'], template);
  });
});

describe('applyTemplate', () => {
  it('{room}を置換する', () => {
    expect(applyTemplate('{room}の練習！', { room: 'スタジオA', band: 'Band', hour: '14' }))
      .toBe('スタジオAの練習！');
  });

  it('{band}を置換する', () => {
    expect(applyTemplate('{band}の練習！', { room: 'スタジオA', band: 'ロックバンド', hour: '14' }))
      .toBe('ロックバンドの練習！');
  });

  it('{hour}を置換する', () => {
    expect(applyTemplate('{hour}時から！', { room: 'スタジオA', band: 'Band', hour: '14' }))
      .toBe('14時から！');
  });

  it('複数プレースホルダーを同時に置換する', () => {
    expect(applyTemplate('{room}で{band}が{hour}時から！', { room: 'スタジオA', band: 'Band', hour: '9' }))
      .toBe('スタジオAでBandが9時から！');
  });
});
