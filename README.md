# STS2 Card Advisor

## How to open

1. Install **Node.js 22.13+** (Node 22 LTS recommended). If you use a version manager, this repo now includes `.nvmrc` and `.node-version`.
2. Run `npm install`
3. Run `make dev`
4. Open http://localhost:5173

Why this matters:

- The backend uses Node's built-in `node:sqlite` module, which is available in newer Node 22 releases.
- The frontend's Vite version also expects a newer Node runtime.

## 1. Upload run history

1. Open **Settings**.
2. Set **Local saves directory** (or leave blank for the default Mac path), then **Save & Restart Watcher**.
3. Finished `.run` files import automatically from that folder.
4. Or click **Choose history folder…** / **Choose .run files…** to upload manually.

Default Mac path:

```
~/Library/Application Support/SlayTheSpire2/steam/<steamid>/profile1/saves
```

## 3. Share run history with friends

Run history is pooled automatically from `data/community_runs/`. Anyone can contribute their `.run` files:

1. Copy your finished `.run` files from:
   ```
   ~/Library/Application Support/SlayTheSpire2/steam/<steamid>/profile1/saves/history/
   ```
   into `data/community_runs/` in this repo.
2. `git add data/community_runs/ && git commit -m "add runs" && git push`
3. Everyone else pulls — the backend picks up the new files on next `make dev` startup.

The backend imports them under a shared **community** user, so they count in global stats automatically.

## 4. Run Advisor

1. Start a run in-game (`make dev` must be running).
2. Open the **Advisor** tab → **Sync** (or wait for auto-sync).
3. Fill the 3 offered cards (Enter advances to the next slot).
4. Click **Get Recommendation**.
5. After you pick, **Next Floor →** clears offers and re-syncs.
