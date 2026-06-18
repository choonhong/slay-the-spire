#!/usr/bin/env python3
"""
Scrapes card text, cost, type, rarity, color and keywords from
https://ststracker.app/cards (single page fetch, SvelteKit codex data).

Outputs: data/card_text.json

Usage:
  python3 scripts/scrape_card_text.py
  make scrape-text
"""

import urllib.request
import re
import json
import os
import sys
from datetime import datetime, timezone

URL = "https://ststracker.app/cards"
OUT = os.path.join(os.path.dirname(__file__), "../data/card_text.json")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8")


def clean_description(text: str) -> str:
    """Convert STS BBCode tokens to readable text, strip formatting tags."""
    # Replace value tokens before stripping tags
    text = re.sub(r'\[energy:(\d+)\]', r'\1 Energy', text)
    text = re.sub(r'\[star:(\d+)\]', r'\1★', text)
    text = re.sub(r'\[energy\]', 'Energy', text)
    text = re.sub(r'\[star\]', '★', text)
    # Strip remaining BBCode tags (keep inner text for paired tags like [gold]...[/gold])
    text = re.sub(r'\[/?[^\]]+\]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_string_field(block: str, field: str) -> str | None:
    m = re.search(rf'{field}:"((?:[^"\\]|\\.)*)"', block)
    return m.group(1) if m else None


def extract_balanced(s: str, start: int) -> str:
    """Return the brace-balanced {...} substring starting at index `start` (must be '{')."""
    depth = 0
    for i in range(start, len(s)):
        if s[i] == '{':
            depth += 1
        elif s[i] == '}':
            depth -= 1
            if depth == 0:
                return s[start:i + 1]
    return s[start:]


def parse_codex(html: str) -> list[dict]:
    """
    Extract card entries from the SvelteKit codex:{cards:{...}} block.
    Each card: key:{name:"...",description:"...",upgradeDescription:"...",
                    cost:N,type:"...",rarity:"...",color:"...",imageUrl:"...",
                    upgrade:{...},keywords:[...]}
    """
    m = re.search(r'codex:\{cards:\{', html)
    if not m:
        raise RuntimeError("Could not find codex.cards in page HTML")

    # Extract the entire cards{} block (brace-balanced)
    block = extract_balanced(html, m.end() - 1)[1:-1]  # strip outer {}

    # Find every top-level key:{...} entry
    card_key_re = re.compile(r'(?:^|,)([a-z][a-z0-9_]*):\{')

    cards = []
    skip_keys = {'upgrade'}

    for km in card_key_re.finditer(block):
        key = km.group(1)
        if key in skip_keys:
            continue

        # brace_pos points to the '{' of this entry
        brace_pos = km.end() - 1
        entry = extract_balanced(block, brace_pos)

        name     = extract_string_field(entry, 'name')
        desc_raw = extract_string_field(entry, 'description')
        upg_raw  = extract_string_field(entry, 'upgradeDescription')
        image    = extract_string_field(entry, 'imageUrl')

        m_cost  = re.search(r'cost:(-?\d+|X)', entry)
        m_type  = re.search(r'type:"([^"]+)"', entry)
        m_rar   = re.search(r'rarity:"([^"]+)"', entry)
        m_color = re.search(r'color:"([^"]+)"', entry)
        m_kw    = re.search(r'keywords:\[([^\]]*)\]', entry)

        if not (name and desc_raw is not None and m_cost and m_type and m_rar and m_color):
            continue

        def unescape(s: str) -> str:
            return s.replace('\\n', '\n').replace('\\"', '"').replace('\\\\', '\\')

        keywords = re.findall(r'"([^"]+)"', m_kw.group(1)) if m_kw else []
        cost_val = m_cost.group(1)
        cost_display = "N/A" if cost_val == "-1" else cost_val

        cards.append({
            "id":                  f"CARD.{key.upper()}",
            "key":                 key,
            "name":                name,
            "description":         clean_description(unescape(desc_raw)),
            "description_raw":     unescape(desc_raw),
            "upgrade_description": clean_description(unescape(upg_raw)) if upg_raw else "",
            "cost":                cost_display,
            "type":                m_type.group(1).capitalize(),
            "rarity":              m_rar.group(1).capitalize(),
            "color":               m_color.group(1),
            "keywords":            keywords,
            "image_url":           image or "",
        })

    return cards


def main():
    print(f"Fetching {URL} ...")
    html = fetch(URL)
    print(f"Page size: {len(html):,} bytes")

    cards = parse_codex(html)

    if not cards:
        print("ERROR: No cards extracted — page structure may have changed.", file=sys.stderr)
        sys.exit(1)

    cards.sort(key=lambda c: c["id"])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(cards, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(cards)} cards → {OUT}")
    print(f"Scraped at: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("\nSample entries:")
    for c in cards[:4]:
        print(f"  [{c['rarity'][0]}] {c['name']:<25} {c['cost']}⚡ {c['type']:<7} ({c['color']})")
        print(f"       {c['description'][:75]}")
        if c['keywords']:
            print(f"       Keywords: {', '.join(c['keywords'])}")


if __name__ == "__main__":
    main()
