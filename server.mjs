import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/style.css', ['style.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']], ['/lyrics.js', ['lyrics.js', 'text/javascript']], ['/stars.js', ['stars.js', 'text/javascript']], ['/tracks.js', ['tracks.js', 'text/javascript']], ['/icon.svg', ['icon.svg', 'image/svg+xml']], ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']], ['/robots.txt', ['robots.txt', 'text/plain']], ['/sitemap.xml', ['sitemap.xml', 'application/xml']]]);
http.createServer(async (req, res) => {
  const file = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try { const content = await readFile(new URL(`./dist/${file[0]}`, import.meta.url)); res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(content); }
  catch { res.writeHead(500); res.end('Unable to load page'); }
}).listen(4317, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4317'));
