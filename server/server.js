import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnthropicClient } from './anthropic.js';
import { InterviewService } from './interview.js';

await loadEnv();

const rootDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const service = new InterviewService({ ai: new AnthropicClient() });
const port = Number.parseInt(process.env.PORT || '3000', 10);

const server = createServer(async (request, response) => {
  try {
    setSecurityHeaders(response);
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(response, 200, {
        status: 'ok',
        aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/interviews') {
      const interview = await service.start(await readJson(request));
      return sendJson(response, 201, { interview });
    }

    const match = url.pathname.match(/^\/api\/interviews\/([0-9a-f-]+)(?:\/(answers|finish))?$/);
    if (match) {
      const [, id, action] = match;
      if (request.method === 'GET' && !action) {
        return sendJson(response, 200, { interview: service.get(id) });
      }
      if (request.method === 'POST' && action === 'answers') {
        return sendJson(response, 200, await service.answer(id, await readJson(request)));
      }
      if (request.method === 'POST' && action === 'finish') {
        return sendJson(response, 200, service.finish(id));
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return sendJson(response, 404, { error: 'API route not found.' });
    }
    return serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    return sendJson(response, error.statusCode || 500, {
      error: error.statusCode ? error.message : 'Unexpected server error.',
    });
  }
});

server.listen(port, () => {
  console.log(`AI interviewer running at http://localhost:${port}`);
});

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 128 * 1024) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

async function serveStatic(pathname, response) {
  const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safePath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(rootDirectory, safePath);
  if (!filePath.startsWith(rootDirectory)) {
    return sendJson(response, 403, { error: 'Forbidden.' });
  }
  try {
    const file = await readFile(filePath);
    response.writeHead(200, { 'content-type': mimeType(filePath) });
    response.end(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const index = await readFile(join(rootDirectory, 'index.html'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(index);
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function setSecurityHeaders(response) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self'");
}

function mimeType(filePath) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
  }[extname(filePath)] || 'application/octet-stream';
}

async function loadEnv() {
  try {
    const contents = await readFile(join(process.cwd(), '.env'), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
