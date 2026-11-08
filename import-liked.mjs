// Merge an Exportify "Liked Songs" CSV into soundcloud-import.json.
// Existing tracks keep their positions (build-catalog.mjs maps by index); new songs are appended.
// Usage: node import-liked.mjs path/to/liked.csv
import { readFile, writeFile } from 'node:fs/promises';

const csvPath = process.argv[2];
if (!csvPath) throw new Error('Usage: node import-liked.mjs path/to/liked.csv');

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...rows] = parseCsv((await readFile(csvPath, 'utf8')).replace(/^﻿/, ''));
const col = name => { const index = header.indexOf(name); if (index < 0) throw new Error(`Missing column: ${name}`); return index; };
const [uri, name, artists, duration] = ['Track URI', 'Track Name', 'Artist Name(s)', 'Track Duration (ms)'].map(col);

const importPath = 'soundcloud-import.json';
const catalog = JSON.parse((await readFile(importPath, 'utf8')).replace(/^﻿/, ''));
const known = new Set(catalog.tracks.map(track => track.spotifyUri));
let added = 0;
for (const row of rows) {
  if (!row[uri]?.startsWith('spotify:track:') || known.has(row[uri])) continue;
  known.add(row[uri]);
  catalog.tracks.push({ title: row[name], artist: row[artists], spotifyUri: row[uri], soundcloudUrl: null, status: 'unmatched', sourceDuration: Number(row[duration]) });
  added++;
}
catalog.name = 'My liked songs';
catalog.sourceNote = `${catalog.tracks.length} songs: Spotify Liked Songs export (${rows.length} songs) merged with the earlier public playlist import.`;
await writeFile(importPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ csvRows: rows.length, added, total: catalog.tracks.length }));
