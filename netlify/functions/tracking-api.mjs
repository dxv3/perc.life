// Serves the tracked data to js/roblox/stats.js.
import { GAMES } from '../lib/games.mjs';
import { loadRows } from '../lib/store.mjs';

export default async req => {
  const { pathname, searchParams } = new URL(req.url);
  const headers = { 'Cache-Control': 'public, max-age=60' };

  if (pathname.endsWith('/games')) return Response.json(GAMES, { headers });

  const universeId = Number(searchParams.get('universeId')) || GAMES[0].universeId;
  if (!GAMES.some(g => g.universeId === universeId)) return Response.json({ error: 'unknown game' }, { status: 404 });
  return Response.json(await loadRows(universeId), { headers });
};

export const config = { path: ['/tracking/api/stats', '/tracking/api/games'] };
