export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const TRANSLITERATION: Record<string, string> = { č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'dj' };

/** "Ana Anić" → "ana" (letters, digits, . _ - only, as the username rule allows). */
export function suggestUsername(fullName: string): string {
  return (fullName.trim().split(/\s+/)[0] ?? '')
    .toLowerCase()
    .replace(/[čćžšđ]/g, (c) => TRANSLITERATION[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 30);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Readable password (no 0/O, 1/l/I), from crypto randomness. */
export function generatePassword(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Four random digits. */
export function generatePin(): string {
  const [n = 0] = crypto.getRandomValues(new Uint32Array(1));
  return String(n % 10_000).padStart(4, '0');
}
