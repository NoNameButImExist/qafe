import { describe, expect, it } from 'vitest';
import { percentChange, presetRange, shortDate } from './periods';

describe('report periods', () => {
  const wednesday = new Date(2026, 9, 7); // 7 Oct 2026

  it('builds the preset ranges from local dates', () => {
    expect(presetRange('today', wednesday)).toEqual({ from: '2026-10-07', to: '2026-10-07' });
    expect(presetRange('yesterday', wednesday)).toEqual({ from: '2026-10-06', to: '2026-10-06' });
    expect(presetRange('week', wednesday)).toEqual({ from: '2026-10-05', to: '2026-10-07' });
    expect(presetRange('last7', wednesday)).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(presetRange('month', wednesday)).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(presetRange('lastMonth', wednesday)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('week', new Date(2026, 9, 11))).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
    });
  });

  it('formats dates and changes', () => {
    expect(shortDate('2026-10-07', 'bs')).toBe('7. 10.');
    expect(shortDate('2026-10-07', 'en', true)).toBe('7 Oct 2026');
    expect(percentChange('110', '100')).toBe(10);
    expect(percentChange('50.00', '0.00')).toBeNull();
  });
});
