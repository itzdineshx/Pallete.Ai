import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, '..', 'dist');
const port = Number(process.env.PORT || 3000);
const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || process.env.VITE_HF_TOKEN;

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

const send = (res, status, headers, body) => {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers || {})) {
    if (v != null) res.setHeader(k, v);
  }
  res.end(body);
};

const proxyHf = async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return;
  }

  if (!hfToken) {
    send(res, 500, { 'Content-Type': 'application/json' }, JSON.stringify({ error: 'Missing HF_TOKEN on server' }));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  let target = '';
  if (pathname.startsWith('/api/hf/chat/completions')) {
    target = `https://router.huggingface.co/v1/chat/completions${url.search}`;
  } else if (pathname.startsWith('/api/hf/models/')) {
    const rest = pathname.slice('/api/hf/models/'.length);
    target = `https://router.huggingface.co/models/${rest}${url.search}`;
  } else {
    send(res, 404, { 'Content-Type': 'application/json' }, JSON.stringify({ error: 'Unknown HF proxy route' }));
    return;
  }

  const headers = {
    'Authorization': `Bearer ${hfToken}`,
  };
  if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);
  if (req.headers['accept']) headers['Accept'] = String(req.headers['accept']);

  const method = req.method || 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);

  const upstream = await fetch(target, { method, headers, body });
  const ct = upstream.headers.get('content-type');
  const buf = Buffer.from(await upstream.arrayBuffer());

  send(res, upstream.status, {
    ...(ct ? { 'Content-Type': ct } : {}),
    'Access-Control-Allow-Origin': '*',
  }, buf);
};

const serveStatic = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = url.pathname;
  if (filePath === '/') filePath = '/index.html';

  const resolved = path.resolve(distDir, '.' + filePath);
  if (!resolved.startsWith(distDir)) {
    send(res, 403, { 'Content-Type': 'text/plain' }, 'Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = ext === '.html'
      ? 'text/html'
      : ext === '.js'
      ? 'application/javascript'
      : ext === '.css'
      ? 'text/css'
      : ext === '.svg'
      ? 'image/svg+xml'
      : ext === '.png'
      ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : 'application/octet-stream';

    send(res, 200, { 'Content-Type': contentType }, data);
  } catch (e) {
    // SPA fallback
    try {
      const html = await fs.readFile(path.join(distDir, 'index.html'));
      send(res, 200, { 'Content-Type': 'text/html' }, html);
    } catch (e2) {
      send(res, 404, { 'Content-Type': 'text/plain' }, 'Not Found');
    }
  }
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/hf/')) {
      await proxyHf(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (e) {
    send(res, 500, { 'Content-Type': 'text/plain' }, 'Internal Server Error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
