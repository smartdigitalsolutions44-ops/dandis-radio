import { readFile, writeFile } from 'node:fs/promises';
const urls = JSON.parse(await readFile('soundcloud-candidates.json', 'utf8'));
const tracks = new Map();
try { for (const track of JSON.parse(await readFile('soundcloud-evidence.json', 'utf8')).tracks) tracks.set(track.id, track); } catch {}
const catalog = JSON.parse((await readFile('soundcloud-import.json', 'utf8')).replace(/^\uFEFF/, '')).tracks;
const links = new Map();
const norm = value => value.toLowerCase().normalize('NFKD').replace(/&amp;/g, ' and ').replace(/&#x27;|&#39;|&quot;/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const failures = [];
function collect(value, source) {
  if (!value || typeof value !== 'object') return;
  if (value.kind === 'track' && value.permalink_url && value.title) {
    tracks.set(value.id, { id: value.id, title: value.title, artist: value.user?.username, artistUrl: value.user?.permalink_url, url: value.permalink_url, duration: value.duration, fullDuration: value.full_duration, policy: value.policy, embeddable: value.embeddable_by, streamable: value.streamable, source });
  }
  for (const child of Object.values(value)) if (child && typeof child === 'object') collect(child, source);
}
for (let start = 0; start < urls.length; start += 3) {
  await Promise.all(urls.slice(start, start + 3).map(async url => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      for (const match of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs)) {
        const title = match[2].replace(/<[^>]+>/g, '').trim();
        const normalized = norm(title);
        if (!normalized) continue;
        const candidates = catalog.map((track, index) => ({ index, title: norm(track.title) })).filter(track => track.title === normalized || (Math.min(track.title.length, normalized.length) >= 8 && (` ${normalized} `.includes(` ${track.title} `) || ` ${track.title} `.includes(` ${normalized} `))));
        if (!candidates.length) continue;
        const target = new URL(match[1], url);
        if (target.hostname !== 'soundcloud.com' || target.pathname.split('/').filter(Boolean).length !== 2 || /\/(tracks|popular-tracks|sets|likes|comments)$/.test(target.pathname)) continue;
        target.search = ''; links.set(target.href, { url: target.href, title, candidates: candidates.map(track => track.index) });
      }
      const match = html.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);/s);
      if (!match) throw new Error('No public metadata');
      collect(JSON.parse(match[1]), url);
    } catch (error) { failures.push({ url, error: error.message }); }
  }));
  await new Promise(resolve => setTimeout(resolve, 250));
}
await writeFile('soundcloud-matching-links.json', JSON.stringify([...links.values()], null, 2));
const extraLinks = [...links.keys()].filter(url => ![...tracks.values()].some(track => track.url === url));
for (let start = 0; start < extraLinks.length; start += 3) {
  await Promise.all(extraLinks.slice(start, start + 3).map(async url => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return;
      const html = await response.text();
      const match = html.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);/s);
      if (match) collect(JSON.parse(match[1]), url);
    } catch (error) { failures.push({ url, error: error.message }); }
  }));
}
await writeFile('soundcloud-evidence.json', JSON.stringify({ checkedAt: new Date().toISOString(), tracks: [...tracks.values()], failures }, null, 2));
console.log(JSON.stringify({ pages: urls.length, tracks: tracks.size, failures }));
