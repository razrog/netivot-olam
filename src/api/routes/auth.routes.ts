import { Router } from 'express';
import { users } from '../../db/users.js';
import { verifyPassword } from '../../auth/password.js';

// Login / logout / who-am-I. Sessions are server-side; the client only holds
// an opaque, httpOnly cookie.

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = users.getByEmail(email.toLowerCase().trim());
  // Same generic error whether the email is unknown or the password is wrong,
  // so we don't reveal which emails are registered (no user enumeration).
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'invalid email or password' });
    return;
  }

  // Prevent session fixation: issue a fresh session id on login.
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: 'login failed' });
      return;
    }
    req.session.userId = user.id;
    req.session.isAdmin = !!user.is_admin;
    req.session.email = user.email;
    res.json({ email: user.email, isAdmin: !!user.is_admin });
  });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get('/me', (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'not logged in' });
    return;
  }
  res.json({ email: req.session.email, isAdmin: !!req.session.isAdmin });
});
