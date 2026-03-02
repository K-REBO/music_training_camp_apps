import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';
import { readFileSync } from 'fs';
import { join } from 'path';

// 環境変数または.envファイルから管理者パスワードを取得
function getAdminPassword(): string {
  // 1. 環境変数から取得
  if (process.env.ADMIN_PASSWORD) {
    return process.env.ADMIN_PASSWORD;
  }

  // 2. .envファイルから取得
  try {
    const envPath = join(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^ADMIN_PASSWORD=(.+)$/m);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (error) {
    console.log('No .env file found, using default password');
  }

  // 3. デフォルト値
  return 'admin123';
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const { name, grade, password } = await request.json();
    
    if (!name || !grade) {
      return json({
        success: false,
        error: '名前と学年は必須です'
      }, { status: 400 });
    }

    // 椎木知仁の場合はパスワード認証
    if (name.trim() === '椎木知仁') {
      const ADMIN_PASSWORD = getAdminPassword();
      
      if (!password) {
        return json({
          success: false,
          error: 'パスワードが必要です'
        }, { status: 400 });
      }
      
      if (password !== ADMIN_PASSWORD) {
        return json({
          success: false,
          error: 'パスワードが正しくありません'
        }, { status: 401 });
      }
    }
    
    // メンバー検証
    const member = await dataService.getMemberByNameAndGrade(name.trim(), grade);
    
    if (!member) {
      return json({
        success: false,
        error: '登録されていないメンバーです。名前と学年を確認してください。'
      }, { status: 401 });
    }
    
    // セッション作成
    const session = await dataService.createSession(member.id, member.name, member.grade);
    
    // セッションIDをクッキーに保存
    cookies.set('session_id', session.id, {
      httpOnly: true,
      secure: false, // developmentではfalse
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24時間
      path: '/reservation'
    });
    
    return json({
      success: true,
      data: {
        user: {
          id: member.id,
          name: member.name,
          grade: member.grade
        }
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return json({
      success: false,
      error: 'サーバーエラーが発生しました'
    }, { status: 500 });
  }
};