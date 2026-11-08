import { readFile, writeFile } from 'node:fs/promises';
const read = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const catalog = await read('soundcloud-import.json');
const evidence = await read('soundcloud-evidence.json');
// Automatic matches from find-soundcloud.mjs (uploader = credited artist, same title/version, duration within 3s).
let auto = { matches: {}, checkedAt: null };
try { auto = await read('soundcloud-auto-matches.json'); } catch {}
// Reviewed artist/version matches; source playlist index -> SoundCloud track ID.
const reviewed = {0:2256966452,4:2048539408,5:2381195838,10:2260845038,11:2282538536,12:2136496959,13:2367324641,14:255766393,20:2422892784,24:2420603220,27:2136471009,32:2187686891,34:2164601568,35:278704248,37:11704927,39:2405983038,46:2266771178,48:2105756241,50:2096796267,53:2074444744,57:2311899041,58:2335113191,59:310256758,61:2331426332,70:1305194842,71:159723640,75:512318547,79:1802327166,84:328489161,89:2225442683,99:1012036630,6:2235457085,28:1633403247,36:2392531002,41:247261492,44:2360101643,64:2356204850,80:2302714595,83:2321257823,91:2356538024,94:2287093877,21:2082655818,29:2043455444,55:2342186450,65:2287357913,81:2180063811,88:2329458365,92:2105624469,8:2325054278,30:917813965,40:1864670418,43:2282336834,47:1705538898,56:2387941788,69:2368713467,78:1113949492,90:2388257871,93:1995690407,96:2326297043};
const mismatches = [];
const tracks = catalog.tracks.map((track, index) => {
  const spotifyId = track.spotifyUri.split(':').pop();
  const automatic = reviewed[index] === undefined ? auto.matches[spotifyId] : undefined;
  const match = automatic || evidence.tracks.find(item => item.id === reviewed[index]);
  const checkedAt = automatic ? auto.checkedAt : evidence.checkedAt;
  let status = 'unmatched';
  if (match) {
    if (match.policy === 'SNIP' || match.duration + 1000 < match.fullDuration) status = 'preview';
    else if (!['ALLOW', 'MONETIZE'].includes(match.policy) || match.embeddable !== 'all' || !match.streamable) status = 'unavailable';
    else if (Math.abs(match.fullDuration - track.sourceDuration) > (automatic ? 3000 : 5000)) mismatches.push({ title: track.title, source: track.sourceDuration, soundcloud: match.fullDuration });
    else status = 'ready';
  }
  return { id: spotifyId, title: track.title, artist: track.artist.replace(/\u00a0/g, ' '), duration: track.sourceDuration, status, url: status === 'ready' ? match.url : null, soundcloudId: status === 'ready' ? match.id : null, checkedAt: status === 'ready' ? checkedAt : null };
});
await writeFile('dist/tracks.js', `window.RADIO_CATALOG = ${JSON.stringify({ name: catalog.name, sourceUrl: catalog.sourceUrl, note: catalog.sourceNote, tracks }, null, 2)};\n`);
console.log(JSON.stringify({ total: tracks.length, ready: tracks.filter(t => t.status === 'ready').length, preview: tracks.filter(t => t.status === 'preview').length, unavailable: tracks.filter(t => t.status === 'unavailable').length, mismatches }));
