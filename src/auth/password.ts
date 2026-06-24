import crypto from 'node:crypto';

// Password hashing with scrypt (built into Node — no extra dependency).
// scrypt is salted and deliberately slow, which is what you want for passwords.
// Never use fast hashes (MD5/SHA) for passwords.

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);

  // Constant-time compare to avoid leaking info via timing.
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
