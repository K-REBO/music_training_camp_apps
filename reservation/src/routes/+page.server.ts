import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { dataService } from '$lib/server/data';

export const load: PageServerLoad = async ({ locals, url }) => {
  // ユーザーがログインしていない場合はログインページにリダイレクト
  if (!locals.user) {
    throw redirect(307, `${base}/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  const isAdmin = await dataService.isAdmin(locals.user.id, locals.user.name);

  return {
    user: locals.user,
    isAdmin
  };
};