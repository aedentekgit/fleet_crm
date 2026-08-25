import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Load .env variables into process.env if available
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const value = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

function apiMiddlewarePlugin() {
  return {
    name: 'api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
        const pathname = parsedUrl.pathname;

        if (pathname.startsWith('/api')) {
          let route = pathname.replace(/^\/api\/?/, '');
          if (!route) route = 'db';
          route = route.replace(/\.(js|php)$/, '');

          const routeMap = {
            'db': './api/db.js',
            'notify': './api/notify.js',
            'parse-jobs': './api/parse-jobs.js',
            'webhook': './api/webhook.js',
          };

          const apiFile = routeMap[route];
          if (!apiFile) return next();

          try {
            const modulePath = path.resolve(process.cwd(), apiFile);
            const module = await server.ssrLoadModule(modulePath);
            const handler = module.default;

            if (typeof handler === 'function') {
              // Parse query parameters
              const query = {};
              for (const [k, v] of parsedUrl.searchParams.entries()) {
                query[k] = v;
              }
              req.query = query;

              // Read request body for POST/PUT/DELETE
              if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
                const buffers = [];
                for await (const chunk of req) {
                  buffers.push(chunk);
                }
                const rawBody = Buffer.concat(buffers).toString();
                if (rawBody) {
                  try {
                    req.body = JSON.parse(rawBody);
                  } catch {
                    req.body = rawBody;
                  }
                } else {
                  req.body = {};
                }
              }

              // Enhance res object for Vercel/Express API compatibility
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

              res.status = (code) => {
                res.statusCode = code;
                return res;
              };
              res.json = (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return res;
              };
              res.send = (data) => {
                if (typeof data === 'object') return res.json(data);
                res.end(String(data));
                return res;
              };

              await handler(req, res);
              return;
            }
          } catch (err) {
            console.error('[API Dev Middleware Error]:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Internal API Error', code: err.code }));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiMiddlewarePlugin()],
  server: {
    port: 3000,
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            return 'vendor-core';
          }
        }
      }
    }
  }
});

