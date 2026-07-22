import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { signToken, requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();

interface UserRow { id: number; username: string }

// POST /api/auth/init
// Called on first app load with a client-generated UUID.
// Auto-creates a user if the UUID is new, then returns a JWT.
router.post('/init', (req: Request, res: Response) => {
  const { clientId, displayName } = req.body as { clientId?: string; displayName?: string };

  if (!clientId || typeof clientId !== 'string' || clientId.length < 8) {
    res.status(400).json({ error: 'clientId required' });
    return;
  }

  const db = getDb();
  let user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(clientId) as UserRow | undefined;

  if (!user) {
    // Auto-register: store clientId as username (Steam ID or UUID)
    const label = displayName?.trim() || clientId;
    const result = db.prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)'
    ).run(label, '');
    user = { id: Number(result.lastInsertRowid), username: label };
  }

  const token = signToken(user.id, user.username);
  res.json({ token, user: { id: user.id, username: user.username } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ id: req.userId, username: req.username });
});

export default router;
