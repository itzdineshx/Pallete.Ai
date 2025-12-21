import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const readBody = async (req: any): Promise<Buffer> => {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
};

const hfProxyPlugin = (hfToken: string | undefined): Plugin => {
  return {
    name: 'hf-proxy',
    configureServer(server) {
      server.middlewares.use('/api/hf', async (req, res, next) => {
        try {
          if (!req.url) return next();

          // Basic CORS handling (mainly for safety with some environments)
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          if (!hfToken) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing HF_TOKEN on server. Set it in .env.local' }));
            return;
          }

          const pathOnly = req.url.split('?')[0] || '';
          const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

          let target = '';
          if (pathOnly.startsWith('/chat/completions')) {
            target = `https://router.huggingface.co/v1/chat/completions${qs}`;
          } else if (pathOnly.startsWith('/models/')) {
            target = `https://router.huggingface.co/models/${pathOnly.slice('/models/'.length)}${qs}`;
          } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Unknown HF proxy route' }));
            return;
          }

          const headers: Record<string, string> = {};
          // Forward content-type and accept
          if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);
          if (req.headers['accept']) headers['Accept'] = String(req.headers['accept']);
          headers['Authorization'] = `Bearer ${hfToken}`;

          const method = req.method || 'GET';
          const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);

          const upstream = await fetch(target, {
            method,
            headers,
            body: body as any,
          });

          res.statusCode = upstream.status;
          const ct = upstream.headers.get('content-type');
          if (ct) res.setHeader('Content-Type', ct);

          // Stream body back
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.end(buf);
        } catch (e) {
          next(e);
        }
      });
    },
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const hfToken = env.HF_TOKEN || env.HUGGINGFACE_TOKEN || env.VITE_HF_TOKEN;

  const port = Number(process.env.PORT || 3000);
  const codespace = process.env.CODESPACE_NAME;
  const hmrHost = codespace ? `${codespace}-${port}.app.github.dev` : 'localhost';
  const hmrProtocol = codespace ? 'wss' : 'ws';
  const hmrClientPort = codespace ? 443 : port;

  return {
    server: {
      port,
      host: '0.0.0.0',
      hmr: {
        host: hmrHost,
        protocol: hmrProtocol,
        clientPort: hmrClientPort,
      },
    },
    plugins: [react(), hfProxyPlugin(hfToken)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
