const put = jest.fn();
jest.mock('@vercel/blob', () => ({
  put,
  copy: jest.fn(),
  del: jest.fn(),
  issueSignedToken: jest.fn(),
  presignUrl: jest.fn(),
}));

import { ValidationError } from '../errors/domain-error';
import { classifyStoredPhoto, uploadPrivateBase64Photo } from './private-blob-storage';

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('uploadPrivateBase64Photo', () => {
  beforeEach(() => {
    put.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('stores a pathname when the private upload works', async () => {
    put.mockResolvedValue({ pathname: 'verifications/01abc.jpeg', url: 'https://x/401' });

    const stored = await uploadPrivateBase64Photo(DATA_URL, 'verifications');

    expect(stored).toBe('verifications/01abc.jpeg');
    expect(classifyStoredPhoto(stored)).toBe('private');
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^verifications\/[0-9a-z]+\.jpeg$/),
      expect.any(Buffer),
      expect.objectContaining({ access: 'private' }),
    );
  });

  it('keeps the image inline when the store rejects a private write', async () => {
    // What actually happened in production: the store would not take a
    // private blob, and an exception here failed the whole signup.
    put.mockRejectedValue(new Error('private blobs are not enabled for this store'));

    const stored = await uploadPrivateBase64Photo(DATA_URL, 'verifications');

    expect(stored).toBe(DATA_URL);
    expect(classifyStoredPhoto(stored)).toBe('data');
  });

  it('never falls back to the public store', async () => {
    put.mockRejectedValue(new Error('nope'));

    const stored = await uploadPrivateBase64Photo(DATA_URL, 'verifications');

    expect(classifyStoredPhoto(stored)).not.toBe('public');
    // One attempt, and it was the private one — no retry as public.
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      expect.objectContaining({ access: 'private' }),
    );
  });

  it('still rejects something that is not an image data URL', async () => {
    await expect(uploadPrivateBase64Photo('https://example.test/a.jpg', 'verifications')).rejects.toThrow(
      ValidationError,
    );
    expect(put).not.toHaveBeenCalled();
  });
});
