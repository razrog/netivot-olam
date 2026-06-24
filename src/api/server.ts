import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { authRouter } from './routes/auth.routes.js';
import { lessonsRouter } from './routes/lessons.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { requireAuth, requireAdmin } from './middleware.js';

const PUBLIC_DIR = path.resolve(fileURLToPath(import.meta.url), '../../../public');

// Wires the HTTP layer together. Three groups of routes:
//   /api/auth     — public (login)
//   /api/lessons  — any logged-in user (browse + play)
//   /api/admin    — admins only (edit metadata)
// The static frontend is served for everything else.
export function createServer(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use(
    session({
      name: 'netivot.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true, // not readable by JS — mitigates XSS cookie theft
        sameSite: 'lax', // mitigates CSRF
        secure: config.isProd, // HTTPS-only cookie in production
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  app.use('/api/auth', authRouter);
  app.use('/api/lessons', requireAuth, lessonsRouter);
  app.use('/api/admin', requireAdmin, adminRouter);

  app.use(express.static(PUBLIC_DIR));

  return app;
}
