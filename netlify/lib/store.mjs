import { getStore } from '@netlify/blobs';

// Snapshots live in the "tracker" blob store as one JSONL blob per game per month:
//   stats/<universeId>/<YYYY-MM>.jsonl
export const store = () => getStore({ name: 'tracker', consistency: 'strong' });

const monthKey = row => `stats/${row.universeId}/${row.timestamp.slice(0, 7)}.jsonl`;

export async function appendRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = monthKey(row);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(JSON.stringify(row));
  }
  const s = store();
  for (const [key, lines] of byKey) {
    const existing = (await s.get(key)) || '';
    await s.set(key, existing + lines.join('\n') + '\n');
  }
}

export async function loadRows(universeId) {
  const s = store();
  const { blobs } = await s.list({ prefix: `stats/${universeId}/` });
  const texts = await Promise.all(blobs.map(b => b.key).sort().map(key => s.get(key)));
  return texts
    .flatMap(text => (text || '').split('\n'))
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
