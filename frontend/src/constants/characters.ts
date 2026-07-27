/** Canonical display order for all playable characters. */
export const CHARACTER_ORDER = ['IRONCLAD', 'SILENT', 'NECROBINDER', 'REGENT', 'DEFECT'];

/** Per-character pill colours for run history badges. */
export const CHARACTER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  IRONCLAD:    { bg: 'rgba(220,38,38,0.18)',   border: 'rgba(239,68,68,0.35)',   text: '#fca5a5' },
  SILENT:      { bg: 'rgba(34,197,94,0.18)',   border: 'rgba(74,222,128,0.35)',  text: '#86efac' },
  DEFECT:      { bg: 'rgba(6,182,212,0.18)',   border: 'rgba(34,211,238,0.35)',  text: '#67e8f9' },
  NECROBINDER: { bg: 'rgba(168,85,247,0.18)',  border: 'rgba(192,132,252,0.35)', text: '#d8b4fe' },
  REGENT:      { bg: 'rgba(245,158,11,0.18)',  border: 'rgba(251,191,36,0.35)',  text: '#fcd34d' },
};

/**
 * Sort an array of character strings (with or without the 'CHARACTER.' prefix)
 * into canonical display order. Characters not in the list are placed at the end.
 */
export function sortCharacters(chars: string[]): string[] {
  return [...chars].sort((a, b) => {
    const ai = CHARACTER_ORDER.indexOf(a.replace(/^CHARACTER\./, ''));
    const bi = CHARACTER_ORDER.indexOf(b.replace(/^CHARACTER\./, ''));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}
