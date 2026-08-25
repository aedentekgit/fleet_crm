import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// API Handlers
import dbHandler from './api/db.js';
import notifyHandler from './api/notify.js';
import parseJobsHandler from './api/parse-jobs.js';
import webhookHandler from './api/webhook.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env variables if present
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

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Parse JSON & URL-encoded request bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Helper to wrap API handlers for Express
const wrapHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('[API Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal Server Error', code: err.code });
    }
  }
};

// Mount API routes
app.all(['/api/db', '/api/db.js', '/api/db.php'], wrapHandler(dbHandler));
app.all(['/api/notify', '/api/notify.js', '/api/notify.php'], wrapHandler(notifyHandler));
app.all(['/api/parse-jobs', '/api/parse-jobs.js', '/api/parse-jobs.php'], wrapHandler(parseJobsHandler));
app.all(['/api/webhook', '/api/webhook.js'], wrapHandler(webhookHandler));

// Default /api route fallback
app.all('/api', wrapHandler(dbHandler));

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static build files
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  // SPA fallback for frontend client routing (compatible with Express 4 & 5)
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(200).send('API Server is running. Please build the frontend with `npm run build` to serve the UI.');
  });
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on http://0.0.0.0:${PORT}`);
});
