'use strict';
(() => {
  const get = id => document.getElementById(id);
  const themeButtons = [...document.querySelectorAll('[data-theme]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let still = reducedMotion;
  function savePreference(key, value) { try { localStorage.setItem(key, value); } catch {} }
  function setTheme(theme) {
    if (!['aurora', 'ember', 'ocean'].includes(theme)) theme = 'aurora';
    document.body.dataset.theme = theme;
    themeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === theme)));
  }
  try { setTheme(localStorage.getItem('work-radio-theme') || 'aurora'); still = reducedMotion || localStorage.getItem('work-radio-still') === 'true'; } catch { setTheme('aurora'); }
  themeButtons.forEach(button => button.addEventListener('click', () => { setTheme(button.dataset.theme); savePreference('work-radio-theme', button.dataset.theme); }));
  function showMotion() { document.body.classList.toggle('still', still); get('motion-toggle').setAttribute('aria-pressed', String(still)); get('motion-toggle').textContent = still ? 'Background paused' : 'Pause background'; }
  showMotion();
  if (reducedMotion) { get('motion-toggle').disabled = true; get('motion-toggle').textContent = 'Reduced motion'; }
  get('motion-toggle').addEventListener('click', () => { still = !still; showMotion(); savePreference('work-radio-still', String(still)); });
  let expanded = false;
  function expand(value) {
    expanded = value;
    get('lyrics-panel').classList.toggle('expanded', value);
    document.body.classList.toggle('lyrics-expanded', value);
    get('lyrics-focus').textContent = value ? 'Close · Esc' : 'Expand ↗';
    get('lyrics-focus').setAttribute('aria-expanded', String(value));
    if (value) {
      get('lyrics-panel').setAttribute('role', 'dialog');
      get('lyrics-panel').setAttribute('aria-modal', 'true');
      get('lyrics-focus').focus();
    } else {
      get('lyrics-panel').removeAttribute('role');
      get('lyrics-panel').removeAttribute('aria-modal');
      get('lyrics-focus').focus();
    }
  }
  get('lyrics-focus').addEventListener('click', () => expand(!expanded));
  document.addEventListener('keydown', event => {
    if (!expanded) return;
    if (event.key === 'Escape') { expand(false); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...get('lyrics-panel').querySelectorAll('button:not(:disabled), input, a[href], [tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  const cache = new Map();
  let requestActive = false;
  let retryAfter = 0;
  let trackRevision = 0;
  document.addEventListener('radio-track-change', () => {
    trackRevision++;
    get('lyrics-results').replaceChildren(); get('lyrics-content').replaceChildren(); get('lyrics-track').hidden = true;
    status('Song changed. Choose “Find lyrics” for the selected song.');
  });
  function status(text, error = false) { get('lyrics-status').textContent = text; get('lyrics-status').classList.toggle('error', error); }
  function plainText(track) {
    if (typeof track.plainLyrics === 'string' && track.plainLyrics.trim()) return track.plainLyrics;
    if (typeof track.syncedLyrics === 'string') return track.syncedLyrics.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').replace(/^\[(?:ar|al|ti|by|offset):.*\]\s*$/gmi, '').trim();
    return '';
  }
  function showTrack(track, button) {
    get('lyrics-results').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    get('lyrics-track').hidden = false;
    get('lyrics-title').textContent = track.trackName || 'Untitled';
    get('lyrics-subtitle').textContent = [track.artistName, track.albumName].filter(Boolean).join(' · ');
    const content = get('lyrics-content'); content.replaceChildren();
    const text = track.instrumental ? 'Instrumental — no lyrics for this version.' : plainText(track);
    for (const line of (text || 'No lyrics are available for this version. Try another result.').split(/\r?\n/)) {
      const paragraph = document.createElement('p'); paragraph.className = line.trim() ? 'lyric-line' : 'lyric-space'; paragraph.textContent = line; content.append(paragraph);
    }
    content.scrollTop = 0;
    status(track.instrumental ? 'This version is marked as instrumental.' : 'Scroll to read. Choose another version above if the words don’t match.');
  }
  function renderResults(tracks) {
    get('lyrics-results').replaceChildren();
    if (!tracks.length) { status('No lyrics found. Try a shorter song title or a different artist spelling.'); return; }
    status(`${tracks.length} matching version${tracks.length === 1 ? '' : 's'}. Pick the one you’re listening to.`);
    tracks.forEach(track => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'lyrics-result'; button.setAttribute('aria-pressed', 'false');
      const title = document.createElement('strong'); title.textContent = track.trackName || 'Untitled';
      const detail = document.createElement('small');
      const duration = Number.isFinite(track.duration) && track.duration > 0 ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}` : '';
      detail.textContent = [track.artistName, track.albumName, duration, track.instrumental ? 'Instrumental' : ''].filter(Boolean).join(' · ');
      button.append(title, detail); button.addEventListener('click', () => showTrack(track, button)); get('lyrics-results').append(button);
    });
    if (tracks.length === 1) showTrack(tracks[0], get('lyrics-results').firstElementChild);
  }
  get('lyrics-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (requestActive) return;
    const title = get('lyrics-song').value.trim();
    const artist = get('lyrics-artist').value.trim();
    if (!title) { status('Enter a song title first.', true); return; }
    const query = new URLSearchParams({ track_name: title }); if (artist) query.set('artist_name', artist);
    const key = query.toString();
    get('lyrics-track').hidden = true;
    get('lyrics-content').replaceChildren();
    get('lyrics-results').replaceChildren();
    if (cache.has(key)) { renderResults(cache.get(key)); return; }
    if (Date.now() < retryAfter) { status(`Lyrics search is busy. Try again in ${Math.ceil((retryAfter - Date.now()) / 1000)} seconds.`, true); return; }
    requestActive = true; get('lyrics-search').disabled = true; get('lyrics-search').textContent = 'Finding…'; status('Looking for your song…');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    const revision = trackRevision;
    try {
      const response = await fetch(`https://lrclib.net/api/search?${query}`, { signal: controller.signal, credentials: 'omit', headers: { 'Lrclib-Client': 'DandisRadio/3.1 (https://smartdigitalsolutions44-ops.github.io/dandis-radio)' } });
      if (response.status === 429 || response.status === 503) { const seconds = Number(response.headers.get('Retry-After')); retryAfter = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 30) * 1000; throw new Error('Lyrics search is busy. Please wait a moment and try again.'); }
      if (!response.ok) throw new Error('The lyrics service is unavailable right now. Please try again later.');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('The lyrics service returned an unexpected response. Try again later.');
      const tracks = data.filter(track => track && typeof track === 'object' && typeof track.trackName === 'string').slice(0, 20);
      if (cache.size >= 15) cache.delete(cache.keys().next().value);
      cache.set(key, tracks); if (revision === trackRevision) renderResults(tracks);
    } catch (error) { if (revision === trackRevision) status(error.name === 'AbortError' ? 'Search timed out. Check your connection and try again.' : error instanceof TypeError ? 'Could not reach the lyrics service. Check your connection and try again.' : error.message, true); }
    finally { clearTimeout(timeout); requestActive = false; get('lyrics-search').disabled = false; get('lyrics-search').textContent = 'Find ↗'; }
  });
})();
