import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import statsRouter from './routes/stats';
import runsRouter from './routes/runs';
import configRouter from './routes/config';
import synergiesRouter from './routes/synergies';
import ancientsRouter from './routes/ancients';
import recommendRouter from './routes/recommend';
import currentRunRouter from './routes/currentRun';
import authRouter from './routes/auth';
import uploadRouter from './routes/upload';
import { requireAuth } from './middleware/auth';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Public routes — no auth required
app.use('/api/auth', authRouter);
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes
app.use('/api/stats', requireAuth, statsRouter);
app.use('/api/runs', requireAuth, runsRouter);
app.use('/api/config', requireAuth, configRouter);
app.use('/api/synergies', requireAuth, synergiesRouter);
app.use('/api/ancients', requireAuth, ancientsRouter);
app.use('/api/recommend', requireAuth, recommendRouter);
app.use('/api/current-run', requireAuth, currentRunRouter);
app.use('/api/upload', requireAuth, uploadRouter);

// Serve frontend in production
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[server] Listening on http://0.0.0.0:${PORT}`);
});
