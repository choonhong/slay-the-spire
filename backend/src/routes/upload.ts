import { Router, Response } from 'express';
import { type AuthRequest } from '../middleware/auth';
import { parseRunJson } from '../parser';
import { getDb } from '../db';

const router = Router();

// POST /api/upload/runs — accepts array of { filename, content } objects from the browser
router.post('/runs', (req: AuthRequest, res: Response) => {
  const files = req.body as Array<{ filename: string; content: string }>;
  if (!Array.isArray(files)) {
    res.status(400).json({ error: 'Expected an array of { filename, content }' });
    return;
  }

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const file of files) {
    if (!file.filename || !file.content) { skipped++; continue; }
    // Use filename as the unique file_path key per user
    const filePath = `user:${req.userId}:${file.filename}`;
    try {
      // Check if already stored (by looking at raw content hash via file_path key)
      const db = getDb();
      const existing = db.prepare('SELECT id FROM runs WHERE user_id = ? AND file_path = ?').get(req.userId!, filePath);
      if (existing) { skipped++; continue; }

      const result = parseRunJson(file.content, filePath, req.userId!);
      if (result) added++;
      else { skipped++; errors.push(file.filename); }
    } catch (err) {
      skipped++;
      errors.push(`${file.filename}: ${String(err)}`);
    }
  }

  res.json({ added, skipped, errors });
});

export default router;
