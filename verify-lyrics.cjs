const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function element() { return { children: [], listeners: {}, attributes: {}, dataset: {}, value: '', hidden: false, classList: { toggle() {} }, get firstElementChild() { return this.children[0]; }, setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; }, addEventListener(type, fn) { this.listeners[type] = fn; }, replaceChildren(...children) { this.children = children; }, append(...children) { this.children.push(...children); }, querySelectorAll() { return this.children.filter(c => c.listeners.click); }, focus() {}, getClientRects() { return [1]; } }; }
const nodes = new Map(); const themes = ['aurora', 'ember', 'ocean'].map(theme => Object.assign(element(), { dataset: { theme } })); const storage = new Map();
let requests = 0; let reply = { ok: true, status: 200, json: async () => [{ id: 1, trackName: 'Test Song', artistName: 'Test Artist', plainLyrics: 'An original test line\n\nAnother test line', duration: 184 }] };
const context = vm.createContext({ document: { body: element(), getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }, querySelectorAll() { return themes; }, createElement: element, addEventListener() {} }, window: { matchMedia() { return { matches: false }; } }, localStorage: { getItem(key) { return storage.get(key); }, setItem(key, value) { storage.set(key, value); } }, URLSearchParams, AbortController, setTimeout, clearTimeout, Date, fetch: async () => { requests++; return reply; } });
vm.runInContext(fs.readFileSync('dist/lyrics.js', 'utf8'), context);
const get = id => context.document.getElementById(id);
async function search(title) { get('lyrics-song').value = title; get('lyrics-artist').value = 'Test Artist'; await get('lyrics-form').listeners.submit({ preventDefault() {} }); }
(async () => {
  themes[1].listeners.click(); assert.equal(context.document.body.dataset.theme, 'ember'); assert.equal(storage.get('work-radio-theme'), 'ember');
  get('motion-toggle').listeners.click(); assert.equal(storage.get('work-radio-still'), 'true');
  await search('Test Song'); assert.equal(get('lyrics-title').textContent, 'Test Song'); assert.equal(get('lyrics-content').children.length, 3); assert.equal(get('lyrics-content').children[0].textContent, 'An original test line'); assert.equal(get('lyrics-search').disabled, false);
  await search('Test Song'); assert.equal(requests, 1, 'Repeated search uses memory cache');
  reply = { ok: true, status: 200, json: async () => [] }; await search('Missing Song'); assert.match(get('lyrics-status').textContent, /No lyrics found/); assert.equal(get('lyrics-track').hidden, true); assert.equal(get('lyrics-content').children.length, 0);
  reply = { ok: true, status: 200, json: async () => [{ trackName: 'Instrumental', instrumental: true }] }; await search('Instrumental'); assert.match(get('lyrics-content').children[0].textContent, /Instrumental/);
  { // Spotify-style titles are cleaned and the first artist is used; a miss falls back to looser searches.
    const urls = []; const realFetch = context.fetch;
    context.fetch = async url => { urls.push(decodeURIComponent(String(url)).replace(/\+/g, ' ')); return urls.length < 3 ? { ok: true, status: 200, json: async () => [] } : { ok: true, status: 200, json: async () => [{ trackName: 'Chiltern Firehouse .', artistName: 'fakemink, Skepta', plainLyrics: 'line one' }, { trackName: 'Other', artistName: 'Someone Else', plainLyrics: 'x' }] }; };
    get('lyrics-song').value = 'Chiltern Firehouse .'; get('lyrics-artist').value = 'fakemink, Skepta'; await get('lyrics-form').listeners.submit({ preventDefault() {} });
    assert.match(urls[0], /track_name=Chiltern Firehouse&artist_name=fakemink$/); assert.match(urls[1], /q=fakemink Chiltern Firehouse$/); assert.match(urls[2], /track_name=Chiltern Firehouse$/);
    assert.equal(get('lyrics-results').children.length, 1, 'Title-only fallback keeps only that artist'); assert.equal(get('lyrics-content').children[0].textContent, 'line one');
    urls.length = 0; get('lyrics-song').value = 'absence has a name - Slowed'; get('lyrics-artist').value = 'graur'; await get('lyrics-form').listeners.submit({ preventDefault() {} });
    assert.match(urls[0], /track_name=absence has a name&artist_name=graur$/);
    context.fetch = async () => ({ ok: true, status: 200, json: async () => [] }); get('lyrics-song').value = 'Nothing Here'; get('lyrics-artist').value = 'Nobody'; await get('lyrics-form').listeners.submit({ preventDefault() {} });
    assert.match(get('lyrics-status').textContent, /No lyrics found/); assert.equal(get('lyrics-web').hidden, false); assert.match(get('lyrics-web').href, /google\.com\/search\?q=Nobody%20Nothing%20Here%20lyrics/);
    context.fetch = realFetch;
  }
  reply = { ok: false, status: 429, headers: { get() { return '30'; } } }; await search('Rate Limit'); assert.match(get('lyrics-status').textContent, /busy/); const requestCount = requests; await search('Another query'); assert.equal(requests, requestCount, 'Honours Retry-After'); assert.equal(get('lyrics-search').disabled, false);
  get('lyrics-focus').listeners.click(); assert.equal(get('lyrics-panel').attributes['aria-modal'], 'true'); get('lyrics-focus').listeners.click(); assert.equal(get('lyrics-panel').attributes['aria-modal'], undefined);
  console.log('Passed: themes, motion preference, lyric results, display, cache, empty state, instrumental, rate limits and expanded view.');
})().catch(error => { console.error(error); process.exitCode = 1; });
