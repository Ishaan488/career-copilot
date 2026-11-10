import { describe, it, expect } from 'vitest';
import { isPrivateIp, safeFetch } from '@/shared/http';

describe('T-SSRF: safeFetch and IP restriction', () => {
  it('correctly classifies private and cloud metadata IPv4 addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.5')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.10')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true); // AWS/GCP metadata
    expect(isPrivateIp('0.0.0.0')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
  });

  it('correctly classifies IPv6 private and loopback addresses', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
  });

  it('blocks safeFetch requests to localhost by default', async () => {
    await expect(safeFetch('http://127.0.0.1:3000/test')).rejects.toThrow('SSRF guard');
  });

  it('blocks safeFetch requests to AWS metadata service', async () => {
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/')).rejects.toThrow('SSRF guard');
  });
});
