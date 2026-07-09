import express from 'express';
import cors from 'cors';
import statsRouter from './routes/stats';
import runsRouter from './routes/runs';
import configRouter from './routes/config';
import synergiesRouter from './routes/synergies';
import ancientsRouter from './routes/ancients';
import recommendRouter from './routes/recommend';
import currentRunRouter from './routes/currentRun';
import { startWatcher } from './watcher';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.use('/api/stats', statsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/config', configRouter);
app.use('/api/synergies', synergiesRouter);
app.use('/api/ancients', ancientsRouter);
app.use('/api/recommend', recommendRouter);
app.use('/api/current-run', currentRunRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  startWatcher();
});
