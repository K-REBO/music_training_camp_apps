import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { dataService } from '$lib/server/data';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(307, `${base}/login`);
  }

  const admin = await dataService.isAdmin(locals.user.id, locals.user.name);
  if (!admin) {
    throw redirect(307, base || '/');
  }

  const [members, bands, rooms] = await Promise.all([
    dataService.getMembers(),
    dataService.getBands(),
    dataService.getRooms()
  ]);

  return {
    user: locals.user,
    members,
    bands,
    rooms
  };
};
