// このファイルはテスト用のAPIです。プロダクションでは無効化されています。
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  // プロダクションでは無効化
  return json({
    success: false,
    error: 'Test API is disabled'
  }, { status: 403 });
};