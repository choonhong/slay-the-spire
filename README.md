# STS2 Tracker

A local full-stack TypeScript app that watches your Slay the Spire 2 saves directory, parses `.run` history files in real time, and presents a dashboard for understanding your runs, card choices, and strategy.

## Quick Start

```bash
npm install
make dev          # starts backend :3001 + frontend :5173
# or: npm run dev
```

---

## Features

### Card Stats
Tracks every card offer and pick across all runs. Shows pick rate (how often a card is chosen when offered) and win rate (% of runs won when the card is in the deck). Filterable by character, patch (`build_id`), and colorless cards. Default sort is win rate descending.

> Cards change across patches — use the patch filter to compare balance changes honestly.

### Run History
Paginated list of runs with character, ascension, acts path, and outcome (Win or floor reached). Click any row to expand a detail panel with: damage by act, relics, final deck (Strike/Defend highlighted in red), and rule-based insights (elite kills, damage efficiency per act). An **AI Coach** button optionally sends the run data to a local Ollama model for narrative feedback.

> Rule-based insights: last-act damage per floor, elite count + damage taken from elites, rest site visits. AI Coach requires `ollama serve`.

### Synergies
Finds card pairs that co-occur frequently in winning runs. Calculates **synergy lift** = win rate together minus the average of their individual win rates. Strips Strike/Defend from results to focus on non-starter cards. Filter by character and patch.

> Cross-character pairs are intentional — colorless and neutral cards show up across classes.

### Ancients
Tracks every ancient event relic choice (Neow's bonus + all mid-run ancient encounters: Darv, Orobas, Pael, Tanx, Tezcatara, Nonupeipe, Vakuu). Shows win rate per relic chosen, split into a Neow section and a per-event section. Filter by character and patch.

> Data comes from `map_point_type: "ancient"` → `ancient_choice[].was_chosen` in the `.run` file.

---

## Stack

| Layer | Tech |
|---|---|
| Backend runtime | Node.js + `ts-node-dev` (hot reload) |
| Backend framework | Express |
| Database | `node:sqlite` (Node 22+ built-in, no native build needed) |
| File watching | `chokidar` |
| Frontend bundler | Vite |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Table | `@tanstack/react-table` |
| Charts | `recharts` |
| HTTP client | `axios` |
| AI | Ollama (local LLM, optional) |

---

## Project Structure

```
slay-the-spire/
├── Makefile
├── package.json              # npm workspaces root
├── data/sts2.db              # SQLite (auto-created, delete to force rebuild)
├── backend/src/
│   ├── index.ts              # Express entry, route registration
│   ├── db.ts                 # Schema (SCHEMA_VERSION), all query helpers
│   ├── parser.ts             # Parses .run JSON → inserts into DB
│   ├── watcher.ts            # chokidar watcher, triggers parser
│   └── routes/
│       ├── stats.ts          # /api/stats/cards, /characters, /builds
│       ├── runs.ts           # /api/runs, /:id/details, /:id/ai-insight
│       ├── synergies.ts      # /api/synergies (card pair co-occurrence)
│       ├── ancients.ts       # /api/ancients (relic win rates)
│       └── config.ts         # /api/config (saves path)
└── frontend/src/
    ├── App.tsx               # Tab navigation: Stats / Runs / Synergies / Ancients / Settings
    ├── api.ts                # All fetch helpers + TypeScript interfaces
    ├── utils.ts              # formatCardId, formatRelicId, formatEventName, formatCharacter
    └── components/
        ├── CardStatsTable.tsx
        ├── RunHistory.tsx
        ├── RunDetailPanel.tsx
        ├── Charts.tsx
        ├── Synergies.tsx
        ├── Ancients.tsx
        └── Settings.tsx
```

---

## Save File Path (Mac)

```
~/Library/Application Support/SlayTheSpire2/steam/<steamid>/profile1/saves/history/*.run
```

Auto-detected on startup. Override in the Settings tab.

---

## `.run` File — Key Structure

```
{
  win, ascension, game_mode, build_id, acts,
  players[0].character,
  killed_by_encounter / killed_by_event,
  map_point_history (array of acts)
    └── array of map points
          ├── map_point_type   ("shop", "elite", "ancient", "rest", ...)
          ├── rooms[0].model_id  ("EVENT.NEOW", "EVENT.DARV", ...)
          └── player_stats[]
                ├── card_choices[]       card.id + was_picked
                ├── ancient_choice[]     TextKey + was_chosen   ← relic picks
                ├── relic_choices[]      choice (relic ID) + was_picked
                └── damage_taken[]       damage + enemy
}
```

---

## SQLite Schema (v6)

```sql
runs          id, file_path, character, win, ascension, game_mode, acts,
              build_id, floor_reached, killed_by, parsed_at, raw_json

card_choices  run_id, card_id, was_picked, offer_index

ancient_picks run_id, event_name, is_neow, relic_id
```

> `SCHEMA_VERSION` in `db.ts` controls migrations. Bumping it drops and rebuilds all tables from the `.run` files automatically.

---

## Key Formulas

- **Pick rate** = `SUM(was_picked) / COUNT(offers) × 100%`
- **Win rate** = `runs won with card / runs where card was picked × 100%`
- **Synergy lift** = `win_rate_together − avg(win_rate_A, win_rate_B)`
- **Relic win rate** = `runs won / runs where relic was chosen × 100%`
