// bug-report-kit tests/user-agent.test.ts, plus Android (old PR #2 __tests__/user-agent.test.ts).
import { describe, expect, it } from 'vitest';
import { parseUserAgent } from './user-agent';

describe('parseUserAgent', () => {
  it('parses Chrome on macOS', () => {
    expect(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')).toEqual({ osName: 'macOS', osVersion: '10.15.7', browserName: 'Chrome', browserVersion: '122.0.0.0', deviceType: 'desktop' });
  });
  it('parses Safari on iOS (mobile)', () => {
    const r = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
    expect([r.osName, r.osVersion, r.browserName, r.deviceType]).toEqual(['iOS', '17.5', 'Safari', 'mobile']);
  });
  it('parses iPad as tablet', () => {
    expect(parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1').deviceType).toBe('tablet');
  });
  it('parses Firefox on Windows', () => {
    const r = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0');
    expect([r.osName, r.osVersion, r.browserName, r.browserVersion, r.deviceType]).toEqual(['Windows', '10', 'Firefox', '124.0', 'desktop']);
  });
  it('parses Edge before Chrome', () => {
    const r = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.2365.92');
    expect([r.browserName, r.browserVersion]).toEqual(['Edge', '122.0.2365.92']);
  });
  it('parses Chrome on an Android phone', () => {
    const r = parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');
    expect([r.osName, r.osVersion, r.browserName, r.deviceType]).toEqual(['Android', '14', 'Chrome', 'mobile']);
  });
  it('returns nulls for an unknown user agent', () => {
    expect(parseUserAgent('totally-unknown')).toEqual({ osName: null, osVersion: null, browserName: null, browserVersion: null, deviceType: null });
  });
});
