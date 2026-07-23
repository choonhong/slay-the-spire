import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { type AuthRequest } from '../middleware/auth';
import { parseRunJson } from '../parser';
import { getDb } from '../db';

const COMMUNITY_RUNS_DIR = path.join(__dirname, '../../../data/community_runs');

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
  let failed = 0;
  const errors: string[] = [];

  // Ensure community_runs dir exists
  fs.mkdirSync(COMMUNITY_RUNS_DIR, { recursive: true });

  for (const file of files) {
    if (!file.filename || !file.content) {
      failed++;
      errors.push(`${file.filename || '(unknown)'}: empty content`);
      continue;
    }
    // Use filename as the unique file_path key per user
    const filePath = `user:${req.userId}:${file.filename}`;
    try {
      const db = getDb();
      // Always write to community_runs/<uuid>/ — UUID is globally unique across machines
      const db = getDb();
      const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId!) as { username: string } | undefined;
      const userFolder = userRow?.username ?? String(req.userId);
      const userRunsDir = path.join(COMMUNITY_RUNS_DIR, userFolder);
      fs.mkdirSync(userRunsDir, { recursive: true });
      const destPath = path.join(userRunsDir, path.basename(file.filename));
      if (!fs.existsSync(destPath)) {
        fs.writeFileSync(destPath, file.content, 'utf-8');
      }

      const existing = db.prepare('SELECT id FROM runs WHERE user_id = ? AND file_path = ?').get(req.userId!, filePath);
      if (existing) { skipped++; continue; }

      const result = parseRunJson(file.content, filePath, req.userId!);
      if (result) {
        added++;
      } else { failed++; errors.push(file.filename); }
    } catch (err) {
      failed++;
      errors.push(`${file.filename}: ${String(err)}`);
    }
  }

  res.json({ added, skipped, failed, errors });
});

export default router;
