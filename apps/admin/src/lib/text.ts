const TRANSLITERATION: Record<string, string> = { č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'dj' };

/** "Kafić Fildžan" → "kafic-fildzan": matches the slug rule in core.venues (3–40 chars). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čćžšđ]/g, (c) => TRANSLITERATION[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** Suggests a username from the first name ("Selma Begić" → "selma"). */
export function suggestUsername(fullName: string): string {
  const first = slugify(fullName.split(' ')[0] ?? '').replace(/-/g, '');
  return first.slice(0, 30);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Readable temporary password (no 0/O, 1/l/I), 12 characters from crypto randomness. */
export function generatePassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
