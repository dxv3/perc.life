// Scheduled: snapshots every game in GAMES every 5 minutes.
import { GAMES } from '../lib/games.mjs';
import { appendRows, store } from '../lib/store.mjs';

// One-time import of the history collected by the old VPS tracker. Remove once meta/legacy-import says done.
const LEGACY_STATS_URL = 'http://169.58.190.133:3000/api/stats';
const LEGACY_MAX_ATTEMPTS = 3;

async function fetchServerCount(placeId) {
  let count = 0;
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&limit=100${cursor ? `&cursor=${cursor}` : ''}`;
    const res = await fetch(url);
    const json = await res.json();
    count += (json.data || []).length;
    if (!json.nextPageCursor) break;
    cursor = json.nextPageCursor;
  }
  return count;
}

async function fetchStats(universeId) {
  const [gameRes, votesRes, favRes] = await Promise.all([
    fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`),
    fetch(`https://games.roblox.com/v1/games/votes?universeIds=${universeId}`),
    fetch(`https://games.roblox.com/v1/games/${universeId}/favorites/count`)
  ]);

  const game = (await gameRes.json()).data[0];
  const votes = (await votesRes.json()).data[0];
  const favorites = (await favRes.json()).favoritesCount;
  const servers = await fetchServerCount(game.rootPlaceId).catch(() => 0);

  return {
    timestamp: new Date().toISOString(),
    universeId,
    playing: game.playing,
    visits: game.visits,
    upVotes: votes.upVotes,
    downVotes: votes.downVotes,
    favorites,
    servers
  };
}

async function importLegacyHistory() {
  const s = store();
  const state = (await s.get('meta/legacy-import', { type: 'json' })) || { attempts: 0 };
  if (state.done || state.attempts >= LEGACY_MAX_ATTEMPTS) return;

  state.attempts++;
  try {
    const res = await fetch(LEGACY_STATS_URL, { signal: AbortSignal.timeout(15000) });
    const rows = await res.json();
    await appendRows(rows);
    state.done = true;
    state.rows = rows.length;
    console.log(`imported ${rows.length} legacy rows`);
  } catch (err) {
    console.error(`legacy import attempt ${state.attempts} failed:`, err.message);
  }
  await s.setJSON('meta/legacy-import', state);
}

export default async () => {
  await importLegacyHistory();

  const results = await Promise.allSettled(GAMES.map(g => fetchStats(g.universeId)));
  const rows = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') rows.push(r.value);
    else console.error(`Failed for universeId ${GAMES[i].universeId}:`, r.reason?.message);
  });
  await appendRows(rows);
  console.log(rows);
};

export const config = { schedule: '*/5 * * * *' };
