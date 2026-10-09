import { startAutomationRuntime } from './services/automation-runtime.js';
import { logger, logFailure } from './lib/logger.js';
import { ZodError } from 'zod';
import { validationMessage } from '../shared/schemas.js';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { CLIENT_DIST, ROOT } from './config.js';
import { apiRouter } from './routes/api.js';
import { AiProviderError } from './ai/errors.js';

export function createApp() {
  const app = express();
  startAutomationRuntime();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));

  // Security headers — defense-in-depth for single-user local mode
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    // Personal Supabase projects use per-user subdomains; other integrations remain opt-in.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://openrouter.ai https://integrate.api.nvidia.com http://127.0.0.1:11434 https://api.telegram.org; frame-src https://www.youtube.com https://www.youtube-nocookie.com; font-src 'self' https://fonts.gstatic.com",
    );
    next();
  });

  app.use('/api', (req, res, next) => {
    const started = Date.now();
    res.on('finish', () => logger.info({ event: 'api.request', method: req.method, status: res.statusCode, durationMs: Date.now() - started }, 'Request completed'));
    next();
  }, apiRouter);

  const distIndex = path.join(CLIENT_DIST, 'index.html');


  if (fs.existsSync(distIndex)) {
    app.use(express.static(CLIENT_DIST, { setHeaders(res, filePath) {
      // Vite fingerprints compiled assets; a new build always gets a new URL.
      // Keep HTML and personal API data fresh while reusing unchanged code.
      if (/[.-][\w-]{8}\.(?:js|css)$/.test(path.basename(filePath))) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    } }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(distIndex);
    });
  } else {
    app.get('/', (_req, res) => {
      res.type('html').send(`<!doctype html><html><body style="font-family:system-ui;padding:2rem">
        <h1>Health OS 2.0</h1>
        <p>API is running. Build the client with <code>npm run build</code> or use <code>npm run dev</code>.</p>
        <p>Health: <a href="/api/health">/api/health</a></p>
      </body></html>`);
    });
  }

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logFailure('api.failure', error);
    if (error instanceof ZodError) { res.status(400).json({ error: validationMessage(error) }); return; }
    if (error instanceof AiProviderError) { res.status(502).json({error:error.message}); return; }
    // Never leak secrets in error messages
    const message = error.message || 'Server error';
    const safe = /password|api.?key|secret|token/i.test(message) ? 'Request failed' : message;
    res.status(500).json({ error: safe });
  });

  return app;
}
