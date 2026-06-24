import { db } from './index.js';

// Minimal user store for login. Passwords are never stored in plaintext —
// only the salted scrypt hash produced in src/auth/password.ts.

export interface User {
  id: number;
  email: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

export const users = {
  getByEmail(email: string): User | undefined {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
  },

  create(email: string, passwordHash: string, isAdmin = false): number {
    const info = db
      .prepare('INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, ?)')
      .run(email, passwordHash, isAdmin ? 1 : 0);
    return Number(info.lastInsertRowid);
  },

  count(): number {
    return (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  },
};
