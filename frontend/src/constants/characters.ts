/** Canonical display order for all playable characters. */
export const CHARACTER_ORDER = ['IRONCLAD', 'SILENT', 'NECROBINDER', 'REGENT', 'DEFECT', 'WATCHER'];

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
