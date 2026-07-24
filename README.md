# STS2 Card Advisor

A companion app for **Slay the Spire 2** that tracks your runs, surfaces card stats, and gives real-time deck recommendations while you play.

---

## Getting started

### Prerequisites

- **Node.js 22.13+** (Node 22 LTS recommended). If you use a version manager, `.nvmrc` and `.node-version` are included.
- **Git** + optionally the [GitHub CLI](https://cli.github.com) (`gh`) for contributing runs.

### Run locally

```bash
npm install
make dev
```

Then open **http://localhost:5173** in your browser.

---

## Syncing your runs

The app watches your Slay the Spire 2 save folder and imports finished `.run` files automatically.

1. Open **Settings**.
2. Set **Local saves directory** (leave blank for the default path below), then click **Save & Restart Watcher**.
3. Finished runs are picked up automatically from that point on.
4. Or click **Choose history folder…** / **Choose .run files…** to import manually.

**Default save paths**

| OS | Path |
|---|---|
| Windows | `%APPDATA%\SlayTheSpire2\steam\<user-id>` |
| macOS | `~/Library/Application Support/SlayTheSpire2/steam/<steamid>/profile1/saves` |

---

## Using the Advisor

Get a real-time card pick recommendation while you play:

1. Make sure `make dev` is running.
2. Open the **Advisor** tab and click **Enable Sync** — your current deck and floor sync automatically.
3. Enter the 3 cards being offered (press Enter to advance to the next slot).
4. Click **Get Recommendation** to see which card is rated best for your deck.
5. After picking, click **Next Floor →** to clear the offers and re-sync.

---

## Contributing your runs

Help grow the community dataset by sharing your `.run` files. The more runs contributed, the better the statistics become for everyone.

### Easy way — `make upload`

```bash
make upload
```

This will:
1. Detect your run folder automatically.
2. Create a new git branch with your runs.
3. Push it and open a Pull Request on GitHub (requires `gh` CLI).

### Manual way

1. Copy your finished `.run` files from:
   ```
   ~/Library/Application Support/SlayTheSpire2/steam/<steamid>/profile1/saves/history/
   ```
   into `data/community_runs/<your-uuid>/` in this repo.
2. Commit and push:
   ```bash
   git checkout -b runs/my-runs
   git add data/community_runs/
   git commit -m "runs: add my run history"
   git push origin runs/my-runs
   ```
3. Open a Pull Request on GitHub.

The backend imports community runs automatically on the next `make dev` startup.

---

## Available commands

| Command | Description |
|---|---|
| `make dev` | Start backend + frontend together |
| `make backend` | Start backend only |
| `make frontend` | Start frontend only |
| `make install` | Install npm dependencies |
| `make upload` | Upload your runs and open a PR |
| `make scrape` | Scrape community card data |
| `make scrape-text` | Scrape card text/descriptions |
