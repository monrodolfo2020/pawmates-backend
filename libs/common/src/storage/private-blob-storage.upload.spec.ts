const put = jest.fn();
const del = jest.fn();
jest.mock('@vercel/blob', () => ({
  put,
  del,
  issueSignedToken: jest.fn(),
  presignUrl: jest.fn(),
}));

import { ValidationError } from '../errors/domain-error';
import {
  classifyStoredPhoto,
  moveToPrivateStorage,
  uploadPrivateBase64Photo,
} from './private-blob-storage';

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const PUBLIC_URL = 'https://abc.public.blob.vercel-storage.com/verifications/old.jpg';

describe('uploadPrivateBase64Photo', () => {
  beforeEach(() => {
    put.mockReset();
    del.mockReset();
    delete process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  });

  it('keeps the image inline when no private store is configured', async () => {
    // Private access is a store-level property, so with only a public
    // store there is nowhere private to write — and attempting it is
    // what took production's signup down.
    const stored = await uploadPrivateBase64Photo(DATA_URL, 'verifications');

    expect(stored).toBe(DATA_URL);
    expect(classifyStoredPhoto(stored)).toBe('data');
    expect(put).not.toHaveBeenCalled();
  });

  it('writes to the private store, with its own token, once one is configured', async () => {
    process.env.BLOB_PRIVATE_READ_WRITE_TOKEN = 'vercel_blob_rw_private_xyz';
    put.mockResolvedValue({ pathname: 'verifications/01abc.jpeg', url: 'https://x/401' });

    const stored = await uploadPrivateBase64Photo(DATA_URL, 'verifications');

    expect(stored).toBe('verifications/01abc.jpeg');
    expect(classifyStoredPhoto(stored)).toBe('private');
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^verifications\/[0-9a-z]+\.jpeg$/),
      expect.any(Buffer),
      expect.objectContaining({ access: 'private', token: 'vercel_blob_rw_private_xyz' }),
    );
  });

  it('keeps the image inline when a configured private store still refuses', async () => {
    process.env.BLOB_PRIVATE_READ_WRITE_TOKEN = 'vercel_blob_rw_private_xyz';
    put.mockRejectedValue(new Error('Cannot use private access on a public store'));

    const stored = await uploadPrivateBase64Photo(DATA_URL, 'verifications');

    expect(stored).toBe(DATA_URL);
    expect(classifyStoredPhoto(stored)).toBe('data');
  });

  it('never falls back to the public store', async () => {
    process.env.BLOB_PRIVATE_READ_WRITE_TOKEN = 'vercel_blob_rw_private_xyz';
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

  it('gives up and keeps the image inline when the store never answers', async () => {
    // A hung blob store must not be able to hold a signup open until the
    // whole serverless function times out.
    jest.useFakeTimers();
    process.env.BLOB_PRIVATE_READ_WRITE_TOKEN = 'vercel_blob_rw_private_xyz';
    put.mockReturnValue(new Promise(() => undefined)); // never settles

    const pending = uploadPrivateBase64Photo(DATA_URL, 'verifications');
    await jest.advanceTimersByTimeAsync(9000);

    await expect(pending).resolves.toBe(DATA_URL);
    jest.useRealTimers();
  });

  it('still rejects something that is not an image data URL', async () => {
    await expect(uploadPrivateBase64Photo('https://example.test/a.jpg', 'verifications')).rejects.toThrow(
      ValidationError,
    );
    expect(put).not.toHaveBeenCalled();
  });
});

describe('moveToPrivateStorage', () => {
  beforeEach(() => {
    put.mockReset();
    del.mockReset();
    delete process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  });

  const respondWith = (ok: boolean, status = 200) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: () => Promise.resolve(Buffer.from([0xff, 0xd8, 0xff]).buffer),
    }) as unknown as typeof fetch;
  };

  it('pulls a public image inline and deletes the public original', async () => {
    respondWith(true);

    const stored = await moveToPrivateStorage(PUBLIC_URL, 'verifications');

    expect(classifyStoredPhoto(stored)).toBe('data');
    expect(del).toHaveBeenCalledWith(PUBLIC_URL);
  });

  it('keeps the public original when the download fails', async () => {
    respondWith(false, 404);

    await expect(moveToPrivateStorage(PUBLIC_URL, 'verifications')).rejects.toThrow();
    // Nothing deleted: losing the image is worse than leaving it public
    // for another attempt.
    expect(del).not.toHaveBeenCalled();
  });

  it('leaves anything that is not a public URL untouched', async () => {
    expect(await moveToPrivateStorage(DATA_URL, 'verifications')).toBe(DATA_URL);
    expect(await moveToPrivateStorage('verifications/01abc.jpg', 'verifications')).toBe(
      'verifications/01abc.jpg',
    );
    expect(del).not.toHaveBeenCalled();
  });
});
