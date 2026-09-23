import { DEV_JWT_SECRET, resolveJwtSecret } from './jwt-secret';

const strong = 'a'.repeat(64);

describe('resolveJwtSecret', () => {
  it('uses the configured secret', () => {
    expect(resolveJwtSecret({ JWT_SECRET: strong, VERCEL: '1' })).toBe(strong);
  });

  it('refuses to run deployed without one', () => {
    expect(() => resolveJwtSecret({ VERCEL: '1' })).toThrow(/JWT_SECRET is not set/);
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => resolveJwtSecret({ RENDER: 'true', JWT_SECRET: '  ' })).toThrow(/JWT_SECRET/);
  });

  it('refuses the public development value when deployed', () => {
    expect(() => resolveJwtSecret({ VERCEL: '1', JWT_SECRET: DEV_JWT_SECRET })).toThrow(
      /public development value/,
    );
  });

  it('falls back to the development value on a local machine', () => {
    expect(resolveJwtSecret({})).toBe(DEV_JWT_SECRET);
    expect(resolveJwtSecret({ NODE_ENV: 'test' })).toBe(DEV_JWT_SECRET);
  });

  it('warns about, but accepts, a short secret', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveJwtSecret({ JWT_SECRET: 'short', VERCEL: '1' })).toBe('short');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
