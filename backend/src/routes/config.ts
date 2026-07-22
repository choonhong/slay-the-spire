import { Router, Response } from 'express';
import { loadConfig, saveConfig } from '../config';
import { getSavesPath, stopWatcher, startWatcher } from '../watcher';
import { type AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', (_req: AuthRequest, res: Response) => {
  const config = loadConfig();
  res.json({
    ...config,
    resolvedSavesPath: getSavesPath(),
  });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { savesPath } = req.body as { savesPath?: string };
  const current = loadConfig();
  const updated = {
    ...current,
    savesPath: savesPath?.trim() || undefined,
    // Attribute watched .run imports to the user who saved settings (UUID account)
    watcherUserId: req.userId ?? current.watcherUserId,
  };
  saveConfig(updated);

  stopWatcher();
  void startWatcher(); // cleanup + import under watcherUserId

  res.json({ ok: true, ...updated, resolvedSavesPath: getSavesPath() });
});

export default router;
