// Find SoundCloud uploads for catalog songs that have no reviewed match yet.
// Reads only public SoundCloud pages (artist profiles, their track lists and track pages); never audio.
// A match is accepted only when the uploader is the artist, the title (including version words such
// as "slowed" or "remix") matches, and the full duration is within 3 seconds of the Spotify duration.
// Output: soundcloud-auto-matches.json, used by build-catalog.mjs.
import { readFile, writeFile } from 'node:fs/promises';

const read = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^﻿/, ''));
const catalog = (await read('soundcloud-import.json')).tracks;
const evidence = await read('soundcloud-evidence.json');
const reviewedIndexes = new Set(Object.keys(JSON.parse((await readFile('build-catalog.mjs', 'utf8')).match(/const reviewed = (\{.*?\});/s)[1].replace(/(\d+):/g, '"$1":'))).map(Number));
let previous = { matches: {}, checked: {} };
// Optional, from web searches: { "profiles": { "<artist name>": "<soundcloud permalink>" },
//   "tracks": { "<spotify track id>": ["https://soundcloud.com/user/track", ...] } }
// Profiles are reviewed accounts for artists whose name guess found nobody or the wrong person.
// Hinted tracks get exactly the same checks as everything else.
let hints = {};
try { hints = await read('soundcloud-hints.json'); } catch {}
try { previous = await read('soundcloud-auto-matches.json'); } catch {}

const VERSION_WORDS = ['slowed', 'sped', 'speed', 'nightcore', 'reverb', 'remix', 'bass', 'boosted', 'instrumental', 'acapella', 'acoustic', 'live', 'cover', 'mashup', 'extended', 'edit', 'mix', 'flip', 'vip', 'bootleg', 'hardtekk', 'phonk', 'tiktok'];
const norm = value => String(value).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&amp;|&/g, ' and ').replace(/&#x27;|&#39;|&quot;|['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stripCredits = value => norm(value).replace(/\b(feat|ft|featuring|prod|with)\b.*$/, '').trim();
const versions = value => VERSION_WORDS.filter(word => ` ${norm(value)} `.includes(` ${word} `)).sort().join(',');
const slug = value => norm(value).replace(/\s+/g, '-');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pageCache = new Map();
let requests = 0;
async function page(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  const promise = (async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      requests++;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
        if (response.status === 429 || response.status >= 500) { await sleep(5000 * (attempt + 1)); continue; }
        if (!response.ok) return null;
        return { url: response.url, html: await response.text() };
      } catch { await sleep(2000 * (attempt + 1)); }
    }
    return null;
  })();
  pageCache.set(url, promise);
  return promise;
}
function hydration(html, kind) {
  const match = html.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);/s);
  if (!match) return null;
  try { return JSON.parse(match[1]).find(item => item.hydratable === kind)?.data ?? null; } catch { return null; }
}

// Known artist profiles from earlier reviewed evidence.
const knownProfiles = new Map();
for (const track of evidence.tracks) if (track.artist && track.artistUrl) knownProfiles.set(norm(track.artist).replace(/ /g, ''), new URL(track.artistUrl).pathname.slice(1));

const profileCache = new Map();
function findProfile(artist) {
  const key = norm(artist).replace(/ /g, '');
  if (!key) return Promise.resolve(null);
  if (!profileCache.has(key)) profileCache.set(key, (async () => {
    const base = norm(artist);
    const hinted = hints.profiles?.[artist];
    if (hinted) { const result = await page(`https://soundcloud.com/${hinted}`); const user = result && hydration(result.html, 'user'); if (user) return { permalink: user.permalink, username: user.username }; }
    const guesses = [...new Set([knownProfiles.get(key), base.replace(/ /g, ''), base.replace(/ /g, '-'), base.replace(/ /g, '_'), `${base.replace(/ /g, '')}music`, `${base.replace(/ /g, '')}official`, `official${base.replace(/ /g, '')}`, `the${base.replace(/ /g, '')}`].filter(Boolean))].filter(guess => /^[a-z0-9_-]{2,}$/.test(guess));
    for (const guess of guesses) {
      const result = await page(`https://soundcloud.com/${guess}`);
      const user = result && hydration(result.html, 'user');
      if (user && norm(user.username).replace(/ /g, '') === key) return { permalink: user.permalink, username: user.username };
    }
    return null;
  })());
  return profileCache.get(key);
}

async function profileTrackLinks(permalink) {
  const links = new Map();
  for (const list of ['tracks', 'popular-tracks']) {
    const result = await page(`https://soundcloud.com/${permalink}/${list}`);
    if (!result) continue;
    for (const match of result.html.matchAll(/<a itemprop="url" href="(\/[^"\/]+\/[^"\/?]+)">([^<]*)<\/a>/g)) links.set(`https://soundcloud.com${match[1]}`, match[2]);
  }
  // Album and playlist pages list tracks that may not be among the ~10 on the tracks page.
  const sets = new Set();
  for (const list of ['albums', 'sets']) {
    const result = await page(`https://soundcloud.com/${permalink}/${list}`);
    if (result) for (const match of result.html.matchAll(/href="(\/[^"\/]+\/sets\/[^"\/?]+)"/g)) if (match[1].startsWith(`/${permalink}/`)) sets.add(match[1]);
  }
  for (const set of [...sets].slice(0, 8)) {
    const result = await page(`https://soundcloud.com${set}`);
    if (result) for (const match of result.html.matchAll(/<a itemprop="url" href="(\/[^"\/]+\/[^"\/?]+)">([^<]*)<\/a>/g)) links.set(`https://soundcloud.com${match[1]}`, match[2]);
  }
  return links;
}

function titleMatches(spotifyTitle, soundcloudTitle, artists) {
  const target = stripCredits(spotifyTitle);
  let candidate = stripCredits(soundcloudTitle);
  for (const artist of artists) { const prefix = `${norm(artist)} `; if (candidate.startsWith(prefix)) candidate = candidate.slice(prefix.length); }
  return candidate === target && versions(spotifyTitle) === versions(soundcloudTitle);
}

async function soundAt(url) {
  const result = await page(url);
  const sound = result && hydration(result.html, 'sound');
  if (!sound || sound.kind !== 'track') return null;
  return { id: sound.id, title: sound.title, artist: sound.user?.username, artistUrl: sound.user?.permalink_url, url: sound.permalink_url, duration: sound.duration, fullDuration: sound.full_duration, policy: sound.policy, embeddable: sound.embeddable_by, streamable: sound.streamable, source: url };
}

async function findMatch(track, id) {
  const artists = track.artist.replace(/ /g, ' ').split(/,\s*/).filter(Boolean);
  const tried = [];
  const artistKeys = artists.map(artist => norm(artist).replace(/ /g, ''));
  for (const url of hints.tracks?.[id] || []) {
    const sound = await soundAt(url);
    if (!sound || !titleMatches(track.title, sound.title, artists)) continue;
    if (!artistKeys.includes(norm(sound.artist).replace(/ /g, ''))) continue;
    if (Math.abs(sound.fullDuration - track.sourceDuration) > 3000) continue;
    return { sound, profiles: ['hint'] };
  }
  for (const artist of artists) {
    const profile = await findProfile(artist);
    if (!profile) continue;
    tried.push(profile.permalink);
    const candidates = new Map();
    for (const [url, title] of await profileTrackLinks(profile.permalink)) if (titleMatches(track.title, title, artists)) candidates.set(url, title);
    const base = track.title.replace(/\s*[\(\[]?\s*(feat|ft|with)\.?\s.*$/i, '');
    for (const guess of new Set([slug(track.title), slug(base)])) if (guess) candidates.set(`https://soundcloud.com/${profile.permalink}/${guess}`, null);
    for (const url of candidates.keys()) {
      const sound = await soundAt(url);
      if (!sound || !titleMatches(track.title, sound.title, artists)) continue;
      if (norm(sound.artist).replace(/ /g, '') !== norm(profile.username).replace(/ /g, '')) continue;
      if (Math.abs(sound.fullDuration - track.sourceDuration) > 3000) continue;
      return { sound, profiles: tried };
    }
  }
  return { sound: null, profiles: tried };
}

const targets = catalog.map((track, index) => ({ track, index, id: track.spotifyUri.split(':').pop() })).filter(item => !reviewedIndexes.has(item.index))
  // HINTS_ONLY=1 rechecks only songs with web-search hints (quick, few requests).
  .filter(item => !process.env.HINTS_ONLY || hints.tracks?.[item.id] || item.track.artist.split(/,s*/).some(artist => hints.profiles?.[artist]));
const matches = { ...previous.matches };
const checked = { ...previous.checked };
let done = 0;
const queue = [...targets];
async function worker() {
  while (queue.length) {
    const { track, id } = queue.shift();
    const { sound, profiles } = await findMatch(track, id);
    // Keep earlier matches when a pass finds nothing: a miss can be a rate-limited request, not a removal.
    if (sound) matches[id] = sound;
    checked[id] = { title: track.title, artist: track.artist, profiles, matched: Boolean(sound || matches[id]) };
    if (++done % 20 === 0) console.log(`${done}/${targets.length} checked, ${Object.keys(matches).length} matched, ${requests} requests`);
    await sleep(150);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await writeFile('soundcloud-auto-matches.json', JSON.stringify({ checkedAt: new Date().toISOString(), rule: 'uploader is the credited artist, same title and version words, full duration within 3s', matches, checked }, null, 2) + '\n');
console.log(JSON.stringify({ targets: targets.length, matched: Object.keys(matches).length, requests }));
