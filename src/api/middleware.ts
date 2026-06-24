import type { Request, Response, NextFunction } from 'express';

// Access gates. The app is private: every data route sits behind requireAuth,
// and editing routes additionally behind requireAdmin. Fail closed — if we
// can't confirm the session, we deny.

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'login required' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'login required' });
    return;
  }
  if (!req.session.isAdmin) {
    res.status(403).json({ error: 'admin only' });
    return;
  }
  next();
}
