import { describe, expect, it } from 'vitest';
import { generatePassword, initials, slugify, suggestUsername } from './text';

describe('slugify', () => {
  it('transliterates Bosnian letters and joins words with dashes', () => {
    expect(slugify('Kafić Fildžan')).toBe('kafic-fildzan');
    expect(slugify('Đulistan & Šadrvan')).toBe('djulistan-sadrvan');
  });

  it('matches the database slug rule', () => {
    const rule = /^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/;
    for (const name of ['Café No. 1', '  Bar -- Most  ', 'A'.repeat(60)]) {
      const slug = slugify(name);
      expect(slug.length <= 40).toBe(true);
      if (slug.length >= 3) expect(slug).toMatch(rule);
    }
  });
});

describe('suggestUsername', () => {
  it('uses the first name without diacritics', () => {
    expect(suggestUsername('Selma Begić')).toBe('selma');
    expect(suggestUsername('Đorđe Petrović')).toBe('djordje');
  });
});

describe('generatePassword', () => {
  it('returns 12 unambiguous characters and differs each time', () => {
    const a = generatePassword();
    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    expect(a).not.toBe(generatePassword());
  });
});

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Qafe Admin')).toBe('QA');
    expect(initials('selma')).toBe('S');
  });
});
