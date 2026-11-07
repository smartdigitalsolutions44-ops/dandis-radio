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
  reply = { ok: false, status: 429, headers: { get() { return '30'; } } }; await search('Rate Limit'); assert.match(get('lyrics-status').textContent, /busy/); const requestCount = requests; await search('Another query'); assert.equal(requests, requestCount, 'Honours Retry-After'); assert.equal(get('lyrics-search').disabled, false);
  get('lyrics-focus').listeners.click(); assert.equal(get('lyrics-panel').attributes['aria-modal'], 'true'); get('lyrics-focus').listeners.click(); assert.equal(get('lyrics-panel').attributes['aria-modal'], undefined);
  console.log('Passed: themes, motion preference, lyric results, display, cache, empty state, instrumental, rate limits and expanded view.');
})().catch(error => { console.error(error); process.exitCode = 1; });
