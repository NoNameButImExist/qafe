import { describe, expect, it } from 'vitest';
import { bs } from './bs';
import { detectLocale } from './context';
import { en } from './en';

// Shape of a dictionary: object keys and array lengths, not the text itself.
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === 'key' ? v : shape(v)]),
    );
  }
  return typeof value;
}

describe('i18n', () => {
  it('en has the same structure as bs', () => {
    expect(shape(en)).toEqual(shape(bs));
  });

  it('prefers the stored locale', () => {
    expect(detectLocale('en', ['bs-BA'])).toBe('en');
  });

  it('maps regional languages to bs and falls back to bs', () => {
    expect(detectLocale(null, ['hr-HR'])).toBe('bs');
    expect(detectLocale(null, ['en-US'])).toBe('en');
    expect(detectLocale('xx', ['de-DE'])).toBe('bs');
  });
});
