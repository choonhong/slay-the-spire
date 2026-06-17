#!/usr/bin/env python3
"""
Scrapes card power scores from https://ststracker.app/cards
Outputs: data/community_cards.json

Fields per card:
  id            - CARD.BIG_BANG (matches our card_choices.card_id)
  name          - "Big Bang"
  powerScore    - 79.7  (ELO-based tier score)
  powerTier     - "A"   (S / A / B / C / D)
  eloRating     - 1750
  pickRate      - 82.2  (% offered → chosen, global)
  winRateDelta  - +31.5 (win rate with card minus overall win rate)
  timesPicked   - 4939

Usage:
  python3 scripts/scrape_community_cards.py
  make scrape
"""

import urllib.request
import re
import json
import os
import sys
from datetime import datetime

URL = "https://ststracker.app/cards"
OUT = os.path.join(os.path.dirname(__file__), "../data/community_cards.json")


def scrape() -> list[dict]:
    print(f"Fetching {URL} ...")
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")

    # The page embeds card data as inline JS objects (SvelteKit SSR).
    # Each card block looks like:
    #   {id:"CARD.X",name:"...",pickRate:N,buyRate:N,winRateDelta:N,timesPicked:N,
    #    ...,topCharacters:[{...},...],powerScore:N,powerTier:"X",eloRating:N,...}
    #
    # Strategy: find powerScore positions, then look backward for id/name/stats
    # (handles the nested topCharacters array without needing a full JS parser).

    section = html[html.find('{id:"CARD.'):]

    score_positions = [
        (m.start(), float(m.group(1)), m.group(2), int(m.group(3)))
        for m in re.finditer(
            r'powerScore:([\d.]+),powerTier:"([^"]+)",eloRating:(\d+)', section
        )
    ]

    cards = []
    for pos, score, tier, elo in score_positions:
        chunk = section[max(0, pos - 1000) : pos]
        m_id   = list(re.finditer(r'id:"(CARD\.[^"]+)"', chunk))
        m_name = list(re.finditer(r'name:"([^"]+)"', chunk))
        m_pick = list(re.finditer(r'pickRate:([\d.]+)', chunk))
        m_wind = list(re.finditer(r'winRateDelta:([-\d.]+)', chunk))
        m_tp   = list(re.finditer(r'timesPicked:(\d+)', chunk))
        if m_id and m_name and m_pick and m_wind and m_tp:
            cards.append({
                "id":           m_id[-1].group(1),
                "name":         m_name[-1].group(1),
                "pickRate":     float(m_pick[-1].group(1)),
                "winRateDelta": float(m_wind[-1].group(1)),
                "timesPicked":  int(m_tp[-1].group(1)),
                "powerScore":   score,
                "powerTier":    tier,
                "eloRating":    elo,
            })

    # Deduplicate by id (keep highest powerScore)
    seen: dict[str, dict] = {}
    for c in cards:
        if c["id"] not in seen or c["powerScore"] > seen[c["id"]]["powerScore"]:
            seen[c["id"]] = c

    return sorted(seen.values(), key=lambda c: c["powerScore"], reverse=True)


def main():
    cards = scrape()
    if not cards:
        print("ERROR: No cards extracted — the page structure may have changed.", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(cards, f, indent=2)

    print(f"Saved {len(cards)} cards → {OUT}")
    print(f"Scraped at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"Top 5:")
    for c in cards[:5]:
        print(f"  {c['powerTier']} {c['powerScore']:.1f}  {c['name']:<30}  WinΔ +{c['winRateDelta']}%")


if __name__ == "__main__":
    main()
