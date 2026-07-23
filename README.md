# STS2 Card Advisor

## How to open

1. Run `npm install`
2. Run `make dev`
3. Open http://localhost:5173

## 1. Upload run history

1. Open **Settings**.
2. Set **Local saves directory** (or leave blank for the default Mac path), then **Save & Restart Watcher**.
3. Finished `.run` files import automatically from that folder.
4. Or click **Choose history folder…** / **Choose .run files…** to upload manually.

Default Mac path:

```
~/Library/Application Support/SlayTheSpire2/steam/<steamid>/profile1/saves
```

## 2. Run Advisor

1. Start a run in-game (`make dev` must be running).
2. Open the **Advisor** tab → **Sync** (or wait for auto-sync).
3. Fill the 3 offered cards (Enter advances to the next slot).
4. Click **Get Recommendation**.
5. After you pick, **Next Floor →** clears offers and re-syncs.
