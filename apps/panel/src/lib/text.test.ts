import { describe, expect, it } from 'vitest';
import { generatePassword, generatePin, suggestUsername } from './text';

describe('suggestUsername', () => {
  it('uses the first name in plain lowercase letters', () => {
    expect(suggestUsername('Ana Anić')).toBe('ana');
    expect(suggestUsername('Đorđe Ćosić')).toBe('djordje');
    expect(suggestUsername('  Šemsa ')).toBe('semsa');
  });
});

describe('generatePassword / generatePin', () => {
  it('meets the API rules', () => {
    expect(generatePassword()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{10}$/);
    expect(generatePin()).toMatch(/^\d{4}$/);
  });
});
