import { classifyStoredPhoto } from './private-blob-storage';

describe('classifyStoredPhoto', () => {
  it('recognises a private pathname, which is the only shape new writes produce', () => {
    expect(classifyStoredPhoto('verifications/01m30xea9hnajx.jpg')).toBe('private');
  });

  it('recognises the legacy public blob URL', () => {
    expect(classifyStoredPhoto('https://abc123.public.blob.vercel-storage.com/verifications/x.jpg')).toBe(
      'public',
    );
    expect(classifyStoredPhoto('http://example.test/x.jpg')).toBe('public');
  });

  it('recognises the oldest shape, inline base64 still sitting in the database', () => {
    expect(classifyStoredPhoto('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe('data');
  });

  it('does not mistake a pathname containing "https" for a URL', () => {
    expect(classifyStoredPhoto('verifications/https-01abc.jpg')).toBe('private');
  });
});
