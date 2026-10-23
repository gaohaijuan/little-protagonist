'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../preview');
const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
  catch (_) { response.writeHead(400); response.end(); return; }
  const absolute = path.resolve(root, '.' + pathname);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  // Serve only generated HTML, recognition files and approved book art.
  const isPage = pathname === '/' || pathname === '/index.html';
  const isDraft = pathname === '/drafts/level-1-books-04-10.html';
  const isAsset = /^\/(?:vendor\/(?:mediapipe|pdf-lib|jszip)|models|art\/(?:flower|family|intro|sequence))\/[a-zA-Z0-9_./-]+$/.test(pathname) && !pathname.includes('..');
  const filename = isPage ? path.join(root, 'index.html') : absolute;
  if ((!isPage && !isDraft && !isAsset) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404); response.end(); return; }
  const types = { '.html':'text/html; charset=utf-8', '.mjs':'application/javascript', '.js':'application/javascript', '.wasm':'application/wasm', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.ttf':'font/ttf', '.txt':'text/plain; charset=utf-8' };
  response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': isPage || isDraft ? 'no-store' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
  if (request.method === 'HEAD') { response.end(); return; }
  const file = fs.createReadStream(filename);
  file.on('error', () => response.destroy()); file.pipe(response);
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port 4173 is already in use.' : 'Unable to start the local preview.'); process.exitCode = 1; });
server.listen(4173, '127.0.0.1', () => console.log('小小主角本地开发版：http://127.0.0.1:4173'));
