#!/usr/bin/env node
/**
 * Serves the repository over http for the harness. The menu runs straight from file://, but the
 * settings page is ES modules, and no browser loads those from file:// — so this is what lets
 * `dev/harness.html` open it. Bound to 127.0.0.1 only: that counts as a secure context, which the
 * page's crypto.randomUUID needs, and nothing else on the network gets a look at the source tree.
 *
 * Usage: node dev/serve.mjs [port]      (8765 unless told otherwise)
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? 8765);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function refuse(response, status, text) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(text);
}

const server = createServer(async (request, response) => {
  let file;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    file = path.resolve(root, `.${pathname}`);
  } catch {
    return refuse(response, 400, 'Bad request');
  }
  // Nothing outside the repository, however the path is spelled.
  if (file !== root && !file.startsWith(root + path.sep)) return refuse(response, 403, 'Forbidden');

  let info;
  try {
    info = await stat(file);
  } catch {
    return refuse(response, 404, `Not found: ${pathname}`);
  }
  if (!info.isFile()) return refuse(response, 404, `Not found: ${pathname}`);

  // Never cached — the point is to edit, reload and see it.
  response.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`harness   http://127.0.0.1:${port}/dev/harness.html`);
  console.log(`settings  http://127.0.0.1:${port}/dev/harness.html?settings`);
});
