import type { Request } from 'express';
import { clientIpOf } from './client-ip';

const req = (headers: Record<string, string | string[]>, ip = '10.0.0.1') =>
  ({ headers, ip, socket: {} }) as unknown as Request;

describe('clientIpOf', () => {
  it('prefers x-real-ip', () => {
    expect(
      clientIpOf(req({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' })),
    ).toBe('1.2.3.4');
  });

  it('takes the first x-forwarded-for entry otherwise', () => {
    expect(clientIpOf(req({ 'x-forwarded-for': '5.6.7.8, 10.0.0.2' }))).toBe(
      '5.6.7.8',
    );
  });

  it('falls back to the socket address', () => {
    expect(clientIpOf(req({}))).toBe('10.0.0.1');
  });
});
