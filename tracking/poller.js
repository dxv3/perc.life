import fs from 'fs';

const UNIVERSE_IDS = [9633550700]; // add more universe IDs here as needed
const DATA_FILE = '/opt/tracker/stats.jsonl';

async function fetchStats(universeId) {
  const [gameRes, votesRes, favRes] = await Promise.all([
    fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`),
    fetch(`https://games.roblox.com/v1/games/votes?universeIds=${universeId}`),
    fetch(`https://games.roblox.com/v1/games/${universeId}/favorites/count`)
  ]);

  const game = (await gameRes.json()).data[0];
  const votes = (await votesRes.json()).data[0];
  const favorites = (await favRes.json()).favoritesCount;

  return {
    timestamp: new Date().toISOString(),
    universeId,
    playing: game.playing,
    visits: game.visits,
    upVotes: votes.upVotes,
    downVotes: votes.downVotes,
    favorites
  };
}

async function run() {
  for (const universeId of UNIVERSE_IDS) {
    try {
      const stats = await fetchStats(universeId);
      fs.appendFileSync(DATA_FILE, JSON.stringify(stats) + '\n');
      console.log(stats);
    } catch (err) {
      console.error(`Failed for universeId ${universeId}:`, err.message);
    }
  }
}

run();
