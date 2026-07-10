const CHARACTER_NAMES = ['IRONCLAD', 'SILENT', 'DEFECT', 'WATCHER', 'NECROBINDER', 'REGENT'];
const UPPERCASE_WORDS = new Set(['FTL', 'AOE', 'HP']);

export function formatRelicId(id: string): string {
  return id
    .replace(/^RELIC\./, '')
    .split('_')
    .map(w => UPPERCASE_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function formatEventName(name: string): string {
  if (name === 'NEOW') return "Neow's Bonus";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function formatCardId(id: string): string {
  const stripped = id.replace(/^CARD\./, '');
  const parts = stripped.split('_');
  // Drop trailing character name from basic cards (e.g. STRIKE_REGENT → Strike)
  const filtered = parts[0] === 'STRIKE' || parts[0] === 'DEFEND'
    ? parts.filter(p => !CHARACTER_NAMES.includes(p))
    : parts;
  return filtered
    .map(word =>
      UPPERCASE_WORDS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(' ');
}

export function formatCharacter(id: string): string {
  const name = id.replace(/^CHARACTER\./, '');
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function formatEncounterId(id: string): string {
  return id
    .replace(/^ENCOUNTER\./, '')
    .replace(/_BOSS$/, '')
    .split('_')
    .map(w => UPPERCASE_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
