'use strict';
const $ = id => document.getElementById(id);
const CUSTOM_KEY = 'dandis-radio-soundcloud-v1';
const catalog = window.RADIO_CATALOG || { name: 'My music', tracks: [] };
let customTracks = [];
let selected = null;
let widget = null;
let currentFrame = null;
let filter = 'ready';
let shuffled = false;
let generation = 0;
let playerReady = false;
let loadTimer = null;
const blockedIds = new Set();

function parseSoundCloud(value) {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Use a full https://soundcloud.com/artist/song link.');
  const parts = url.pathname.split('/').filter(Boolean);
  const reserved = ['search', 'discover', 'tags', 'you', 'pages', 'settings', 'upload', 'stations', 'charts'];
  const invalidTrack = ['tracks', 'popular-tracks', 'likes', 'sets', 'albums', 'comments', 'followers', 'following', 'reposts'];
  const valid = parts.length === 2 && !invalidTrack.includes(parts[1]) || parts.length === 3 && parts[1] === 'sets';
  if (!valid || reserved.includes(parts[0]) || parts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) throw new Error('Paste a SoundCloud song or playlist link, rather than a profile or search page.');
  return `https://soundcloud.com/${parts.join('/')}`;
}
function allTracks() { return [...catalog.tracks, ...customTracks]; }
function isReady(track) { return (track.status === 'ready' || track.custom) && !blockedIds.has(track.id); }
function queue() { return allTracks().filter(isReady); }
function note(text, error = false) { $('player-status').textContent = text; $('player-status').classList.toggle('error', error); }
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function saveCustom() { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customTracks)); return true; } catch { message('Added for this visit. This browser cannot save your links.', true); return false; } }
try {
  const stored = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
  if (Array.isArray(stored)) for (const item of stored.slice(0, 300)) {
    try {
      const url = parseSoundCloud(item.url);
      if (allTracks().some(track => track.url === url)) continue;
      customTracks.push({ id: `sc:${url}`, url, title: typeof item.title === 'string' ? item.title.slice(0, 80) : 'SoundCloud link', artist: 'Added by you', status: 'custom', custom: true });
    } catch {}
  }
} catch { message('Saved links could not be loaded. Your imported songs are still available.', true); }

function renderTracks() {
  const tracks = allTracks(), ready = tracks.filter(isReady);
  $('ready-count').textContent = String(ready.length);
  $('all-count').textContent = String(tracks.length);
  $('missing-count').textContent = String(tracks.length - ready.length);
  $('catalog-note').textContent = `${catalog.tracks.filter(t => t.status === 'ready').length} checked SoundCloud matches from ${catalog.tracks.length} imported songs. Added links may need checking.`;
  const query = $('track-search').value.trim().toLocaleLowerCase();
  const visible = tracks.filter(track => (filter === 'all' || (filter === 'ready' ? isReady(track) : !isReady(track))) && `${track.title} ${track.artist}`.toLocaleLowerCase().includes(query));
  $('track-list').replaceChildren();
  for (const track of visible) {
    const row = document.createElement('div'); row.className = 'track-row'; row.classList.toggle('active', track.id === selected);
    const number = document.createElement('span'); number.className = 'track-number'; number.textContent = track.id === selected ? '▶' : String(tracks.indexOf(track) + 1).padStart(2, '0');
    const text = document.createElement('div');
    const title = document.createElement(isReady(track) ? 'button' : 'span'); title.className = 'track-name'; title.textContent = track.title;
    if (isReady(track)) { title.setAttribute('aria-label', `Play ${track.title} by ${track.artist}`); title.addEventListener('click', () => selectTrack(track.id, true)); }
    const artist = document.createElement('p'); artist.className = 'track-artist'; artist.textContent = track.artist; text.append(title, artist);
    const actions = document.createElement('div'); actions.className = 'track-actions';
    if (isReady(track)) {
      if (track.duration) { const duration = document.createElement('span'); duration.className = 'track-duration'; duration.textContent = `${Math.floor(track.duration / 60000)}:${String(Math.floor(track.duration / 1000) % 60).padStart(2, '0')}`; actions.append(duration); }
      const play = document.createElement('button'); play.textContent = 'Play'; play.setAttribute('aria-label', `Play ${track.title}`); play.addEventListener('click', () => selectTrack(track.id, true)); actions.append(play);
    } else {
      const reason = document.createElement('p'); reason.className = 'missing-tag'; reason.textContent = blockedIds.has(track.id) ? 'Not available in this player' : track.status === 'preview' ? 'Preview only — excluded' : track.status === 'unavailable' ? 'Blocked on SoundCloud — excluded' : 'No verified version yet'; text.append(reason);
      const search = document.createElement('a'); search.href = `https://soundcloud.com/search/sounds?q=${encodeURIComponent(`${track.artist} ${track.title}`)}`; search.target = '_blank'; search.rel = 'noopener noreferrer'; search.textContent = 'Find ↗'; search.setAttribute('aria-label', `Find ${track.title} on SoundCloud`); actions.append(search);
    }
    if (track.custom) {
      const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${track.title}`); remove.addEventListener('click', () => {
        customTracks = customTracks.filter(item => item.id !== track.id); saveCustom();
        if (selected === track.id) { const next = queue()[0]; if (next) selectTrack(next.id, false); else resetPlayer(); }
        renderTracks();
      }); actions.append(remove);
    }
    row.append(number, text, actions); $('track-list').append(row);
  }
  if (!visible.length) { const empty = document.createElement('p'); empty.className = 'no-results'; empty.textContent = 'No songs here. Try another search or filter.'; $('track-list').append(empty); }
  $('next').disabled = queue().length < 2; $('previous').disabled = queue().length < 2;
}
function resetPlayer() {
  generation++; clearTimeout(loadTimer); if (widget) { try { widget.pause(); } catch {} }
  widget = null; selected = null; currentFrame = null; playerReady = false;
  $('player').replaceChildren(); $('player-title').textContent = 'Pick a song'; $('player-artist').textContent = ''; $('play-toggle').disabled = true;
}
function selectTrack(id, autoplay = false) {
  const track = allTracks().find(item => item.id === id);
  if (!track || !isReady(track)) return;
  if (selected === id && playerReady && widget) { if (autoplay) widget.play(); return; }
  resetPlayer(); selected = id;
  const frame = document.createElement('iframe'); frame.id = 'soundcloud-player'; frame.title = `${track.title} — SoundCloud player`;
  frame.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(track.url)}&color=%23a3b98b&auto_play=${autoplay}&hide_related=true&show_comments=false&show_reposts=false&show_teaser=false&visual=false`;
  frame.allow = 'autoplay'; frame.scrolling = 'no';
  currentFrame = frame; $('player').replaceChildren(frame);
  $('player-title').textContent = track.title; $('player-artist').textContent = track.artist; $('external').href = track.url;
  $('play-toggle').textContent = 'Play';
  $('lyrics-song').value = track.title; $('lyrics-artist').value = track.custom ? '' : track.artist;
  document.dispatchEvent(new CustomEvent('radio-track-change', { detail: { title: track.title, artist: track.artist } }));
  note('Press play in the SoundCloud player. If your scanner blocks auto-play, tap play again.');
  const token = generation;
  loadTimer = setTimeout(() => { if (token === generation && !playerReady) note('Player taking too long? Use “Open on SoundCloud” below.', true); }, 15000);
  attachWidget(); renderTracks();
}
function attachWidget() {
  if (!window.SC?.Widget || !currentFrame || widget) return;
  const token = generation;
  const local = window.SC.Widget(currentFrame); widget = local;
  const events = window.SC.Widget.Events;
  local.bind(events.READY, () => {
    if (token !== generation) return;
    playerReady = true; clearTimeout(loadTimer); $('play-toggle').disabled = false;
    note('Ready. Press play. SoundCloud may play ads between songs.');
    local.getCurrentSound(sound => {
      if (token !== generation || !sound) return;
      const preview = sound.policy === 'SNIP' || Number(sound.full_duration) > Number(sound.duration) + 1000;
      const blocked = sound.policy === 'BLOCK';
      if (preview || blocked) {
        local.pause(); blockedIds.add(selected); $('play-toggle').disabled = true;
        note(preview ? 'SoundCloud is offering only a preview here. Choose another ready track.' : 'SoundCloud has blocked this track here. Choose another ready track.', true); renderTracks();
      }
    });
  });
  local.bind(events.PLAY, () => { if (token !== generation) return; $('play-toggle').textContent = 'Pause'; note('Playing on SoundCloud.'); });
  local.bind(events.PAUSE, () => { if (token === generation) $('play-toggle').textContent = 'Play'; });
  local.bind(events.FINISH, () => {
    if (token !== generation) return;
    local.getSounds(sounds => local.getCurrentSoundIndex(index => { if (token === generation && (!sounds?.length || index >= sounds.length - 1)) advance(1, true); }));
  });
  local.bind(events.ERROR, () => {
    if (token !== generation) return;
    clearTimeout(loadTimer); playerReady = false; $('play-toggle').disabled = true;
    note('SoundCloud could not play this track. Try Next or open it on SoundCloud.', true);
  });
}
function advance(direction, autoplay) {
  const list = queue(); if (!list.length) return;
  const index = list.findIndex(track => track.id === selected);
  const offset = shuffled && direction > 0 && list.length > 1 ? 1 + Math.floor(Math.random() * (list.length - 1)) : direction;
  const next = list[(Math.max(index, 0) + offset + list.length) % list.length]; selectTrack(next.id, autoplay);
}
$('next').addEventListener('click', () => advance(1, true));
$('previous').addEventListener('click', () => advance(-1, true));
$('play-toggle').addEventListener('click', () => { if (widget && playerReady) widget.toggle(); });
$('shuffle').addEventListener('click', () => { shuffled = !shuffled; $('shuffle').setAttribute('aria-pressed', String(shuffled)); });
$('track-search').addEventListener('input', renderTracks);
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); renderTracks(); }));
$('appearance-toggle').addEventListener('click', () => { $('appearance').hidden = !$('appearance').hidden; $('appearance-toggle').setAttribute('aria-expanded', String(!$('appearance').hidden)); });
$('current-lyrics').addEventListener('click', () => {
  const track = allTracks().find(item => item.id === selected); if (!track) return;
  $('lyrics-song').value = track.title; $('lyrics-artist').value = track.custom ? '' : track.artist;
  $('lyrics-form').requestSubmit(); $('lyrics-panel').scrollIntoView({ block: 'nearest' });
});
$('playlist-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const url = parseSoundCloud($('playlist-url').value);
    const existing = allTracks().find(track => track.url === url);
    if (existing) { selectTrack(existing.id, false); message('This link is already in your queue.'); return; }
    const track = { id: `sc:${url}`, url, title: $('playlist-name').value.trim().slice(0, 80) || 'SoundCloud link', artist: 'Added by you', status: 'custom', custom: true };
    customTracks.push(track); const saved = saveCustom(); filter = 'ready';
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    selectTrack(track.id, false); if (saved) message('Saved on this browser. The SoundCloud player will show availability.'); $('playlist-url').value = '';
  } catch (error) { message(error instanceof TypeError ? 'Enter a complete SoundCloud song or playlist URL.' : error.message, true); }
});
$('collection-name').textContent = catalog.name;
renderTracks(); if (queue().length) selectTrack(queue()[0].id, false);
const apiScript = document.createElement('script'); apiScript.src = 'https://w.soundcloud.com/player/api.js'; apiScript.async = true;
apiScript.addEventListener('load', attachWidget);
apiScript.addEventListener('error', () => note('Extra playback controls could not load. Use the SoundCloud player or the direct link.', true));
document.head.append(apiScript);
function updateClock() { $('clock').textContent = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date()); }
updateClock(); setInterval(updateClock, 30000);
