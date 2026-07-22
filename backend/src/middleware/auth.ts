import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db';

const JWT_SECRET = process.env.JWT_SECRET ?? 'sts2-dev-secret-change-in-production';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('[auth] WARNING: JWT_SECRET not set in production. Set it with: fly secrets set JWT_SECRET=$(openssl rand -hex 32)');
}

// Augment Express Request so all route handlers have userId/username without a custom type
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      username?: string;
    }
  }
}

// Keep AuthRequest as an alias for backward compat with existing imports
export type AuthRequest = Request;

interface UserRow { id: number; username: string }

/** Resolve JWT identity to a real users row (recreates after DB wipe). */
export function resolveUser(userId: number, username: string): UserRow | null {
  if (!username || username.length < 8) return null;
  const db = getDb();

  let user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (user) return user;

  user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username) as UserRow | undefined;
  if (user) return user;

  // DB was wiped (or user row lost) but JWT still has the clientId as username
  const result = db.prepare(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)'
  ).run(username, '');
  return { id: Number(result.lastInsertRowid), username };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    const user = resolveUser(payload.userId, payload.username);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    req.userId = user.id;
    req.username = user.username;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function signToken(userId: number, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '90d' });
}
