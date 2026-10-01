import { describe, expect, it } from 'vitest';
import { deviceHash, isDeviceId, newDeviceId, readCookie, slugFromHost } from './guest-identity.js';

describe('slugFromHost', () => {
  it('takes the venue slug from a subdomain of the base domain', () => {
    expect(slugFromHost('demo.qafe.ba', 'qafe.ba')).toBe('demo');
    expect(slugFromHost('Demo.QAFE.ba:443', 'qafe.ba')).toBe('demo');
    expect(slugFromHost('cafe-1.qafe.localhost:5173', 'qafe.localhost')).toBe('cafe-1');
  });

  it('has no tenant on the bare domain, the api host, nested or foreign hosts', () => {
    expect(slugFromHost('qafe.ba', 'qafe.ba')).toBeNull();
    expect(slugFromHost('api.qafe.ba', 'qafe.ba')).toBeNull();
    expect(slugFromHost('staff.qafe.ba', 'qafe.ba')).toBeNull();
    expect(slugFromHost('panel.qafe.ba', 'qafe.ba')).toBeNull();
    expect(slugFromHost('a.b.qafe.ba', 'qafe.ba')).toBeNull();
    expect(slugFromHost('demo.evil.com', 'qafe.ba')).toBeNull();
    expect(slugFromHost('demoqafe.ba', 'qafe.ba')).toBeNull();
    expect(slugFromHost(undefined, 'qafe.ba')).toBeNull();
  });
});

describe('device id', () => {
  it('is random, well-formed and hashed with the secret', () => {
    const id = newDeviceId();
    expect(isDeviceId(id)).toBe(true);
    expect(newDeviceId()).not.toBe(id);
    expect(isDeviceId('short')).toBe(false);
    expect(deviceHash(id, 'secret-a')).not.toBe(deviceHash(id, 'secret-b'));
    expect(deviceHash(id, 'secret-a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reads a cookie from a raw header', () => {
    expect(readCookie('a=1; qafe_gd=abc%3D; b=2', 'qafe_gd')).toBe('abc=');
    expect(readCookie('a=1', 'qafe_gd')).toBeUndefined();
    expect(readCookie(undefined, 'qafe_gd')).toBeUndefined();
  });
});
