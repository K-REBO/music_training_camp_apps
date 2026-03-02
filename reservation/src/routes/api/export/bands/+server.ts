import type { RequestHandler } from './$types';
import { dataService } from '$lib/server/data';
import { requireAdmin } from '$lib/server/admin-guard';

export const GET: RequestHandler = async ({ locals }) => {
  const authError = await requireAdmin(locals);
  if (authError) return authError;

  const [members, bands] = await Promise.all([
    dataService.getMembers(),
    dataService.getBands()
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    members: members.map(m => ({ name: m.name, grade: m.grade })),
    bands: bands.map(b => ({ name: b.name, members: b.members }))
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename*=UTF-8\'\'%E3%83%90%E3%83%B3%E3%83%89%E3%83%A1%E3%83%B3%E3%83%90%E3%83%BC%E8%A1%A8.json'
    }
  });
};
