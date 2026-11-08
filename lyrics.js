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
    status('Finding lyrics for this song…');
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
  // Spotify titles carry version and credit tags that lyric sites leave out:
  // "absence has a name - Slowed", "Chiltern Firehouse .", "Frisky (feat. Labrinth)".
  const TAGS = 'feat|ft|featuring|with|prod|slowed|sped|speed|super|ultra|reverb|nightcore|bass|boosted|tiktok|version|remaster|remastered|radio edit|extended|live|loop|looped|instrumental|remix|mix|edit|hardtekk|hardstyle|jumpstyle';
  function cleanTitle(title) {
    let text = title.replace(new RegExp(`\\s*[\\(\\[][^\\)\\]]*\\b(?:${TAGS})\\b[^\\)\\]]*[\\)\\]]`, 'gi'), '');
    text = text.replace(new RegExp(`\\s+[-–]\\s+[^-–]*\\b(?:${TAGS})\\b.*$`, 'i'), '');
    const tagless = text.trim();
    text = text.replace(/[\s.·,!?*]+$/, '').replace(/^[\s.·,*]+/, '').trim();
    return (text.length >= 2 ? text : tagless) || title.trim();
  }
  const firstArtist = artist => artist.split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?)\s*/i)[0].trim();
  const simple = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  function webSearch(title, artist) {
    const link = get('lyrics-web'); if (!link) return;
    link.href = `https://www.google.com/search?q=${encodeURIComponent(`${artist} ${title} lyrics`.trim())}`;
    link.hidden = false;
  }
  async function lookup(params, signal) {
    const query = new URLSearchParams(params).toString();
    if (cache.has(query)) return cache.get(query);
    const response = await fetch(`https://lrclib.net/api/search?${query}`, { signal, credentials: 'omit', headers: { 'Lrclib-Client': 'DandisRadio/3.2 (https://smartdigitalsolutions44-ops.github.io/dandis-radio)' } });
    if (response.status === 429 || response.status === 503) { const seconds = Number(response.headers.get('Retry-After')); retryAfter = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 30) * 1000; throw new Error('Lyrics search is busy. Please wait a moment and try again.'); }
    if (!response.ok) throw new Error('The lyrics service is unavailable right now. Please try again later.');
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('The lyrics service returned an unexpected response. Try again later.');
    const tracks = data.filter(track => track && typeof track === 'object' && typeof track.trackName === 'string').slice(0, 20);
    if (cache.size >= 30) cache.delete(cache.keys().next().value);
    cache.set(query, tracks);
    return tracks;
  }
  let pending = false;
  async function runSearch(automatic = false) {
    if (requestActive) { pending = true; return; }
    const rawTitle = get('lyrics-song').value.trim();
    const rawArtist = get('lyrics-artist').value.trim();
    if (!rawTitle) { if (!automatic) status('Enter a song title first.', true); return; }
    const title = cleanTitle(rawTitle);
    const artist = rawArtist ? firstArtist(rawArtist) : '';
    get('lyrics-track').hidden = true; get('lyrics-content').replaceChildren(); get('lyrics-results').replaceChildren();
    const web = get('lyrics-web'); if (web) web.hidden = true;
    if (Date.now() < retryAfter) { status(`Lyrics search is busy. Try again in ${Math.ceil((retryAfter - Date.now()) / 1000)} seconds.`, true); return; }
    // Exact title + artist first, then a looser keyword search, then title only (kept to that artist).
    const attempts = artist ? [{ track_name: title, artist_name: artist }, { q: `${artist} ${title}` }, { track_name: title }] : [{ track_name: title }];
    requestActive = true; get('lyrics-search').disabled = true; get('lyrics-search').textContent = 'Finding…'; status(`Looking for lyrics to “${title}”…`);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    const revision = trackRevision;
    try {
      let found = [];
      for (const params of attempts) {
        let tracks = await lookup(params, controller.signal);
        if (artist && !params.artist_name) tracks = tracks.filter(track => simple(track.artistName).includes(simple(artist)));
        if (tracks.length) { found = tracks; break; }
      }
      // Results with words first, so the best one opens straight away.
      found = [...found].sort((a, b) => Number(Boolean(plainText(b) || b.instrumental)) - Number(Boolean(plainText(a) || a.instrumental)));
      if (revision !== trackRevision) return;
      renderResults(found);
      if (found.length > 1 && (plainText(found[0]) || found[0].instrumental)) showTrack(found[0], get('lyrics-results').firstElementChild);
      if (!found.length) { status(`No lyrics found for “${title}” on LRCLIB. Smaller or newer songs often aren’t there yet.`); webSearch(title, artist); }
    } catch (error) {
      if (revision === trackRevision) { status(error.name === 'AbortError' ? 'Lyrics search timed out. Check your connection and try again.' : error instanceof TypeError ? 'Could not reach the lyrics service (lrclib.net). If you’re at work, the network may block it.' : error.message, true); webSearch(title, artist); }
    } finally {
      clearTimeout(timeout); requestActive = false; get('lyrics-search').disabled = false; get('lyrics-search').textContent = 'Find ↗';
      if (pending) { pending = false; runSearch(true); }
    }
  }
  get('lyrics-form').addEventListener('submit', event => { event.preventDefault(); return runSearch(false); });
  // Look lyrics up automatically when a song is picked (short delay so skipping songs doesn't spam the service).
  let autoTimer = null;
  const scheduleAuto = () => { clearTimeout(autoTimer); autoTimer = setTimeout(() => runSearch(true), 700); };
  document.addEventListener('radio-track-change', scheduleAuto);
  if (get('lyrics-song').value.trim()) scheduleAuto();
})();
