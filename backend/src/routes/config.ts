import { Router, Request, Response } from 'express';
import { loadConfig, saveConfig } from '../config';
import { getSavesPath, stopWatcher, startWatcher } from '../watcher';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const config = loadConfig();
  res.json({
    ...config,
    resolvedSavesPath: getSavesPath(),
  });
});

router.post('/', (req: Request, res: Response) => {
  const { savesPath } = req.body;
  const current = loadConfig();
  const updated = { ...current, savesPath: savesPath || undefined };
  saveConfig(updated);

  // Restart watcher with new path
  stopWatcher();
  startWatcher();

  res.json({ ok: true, resolvedSavesPath: getSavesPath() });
});

export default router;
