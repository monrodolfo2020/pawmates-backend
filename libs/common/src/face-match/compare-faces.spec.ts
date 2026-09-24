const send = jest.fn();
jest.mock('@aws-sdk/client-rekognition', () => {
  class InvalidParameterException extends Error {}
  return {
    RekognitionClient: jest.fn(() => ({ send })),
    CompareFacesCommand: jest.fn((input: unknown) => ({ input })),
    InvalidParameterException,
  };
});

import { InvalidParameterException } from '@aws-sdk/client-rekognition';
import {
  compareFaces,
  faceMatchEnabled,
  testFaceMatchConnection,
} from './compare-faces';

describe('compareFaces', () => {
  const a = Buffer.from('a');
  const b = Buffer.from('b');
  beforeEach(() => send.mockReset());

  it('returns the best similarity among the faces on the ID', async () => {
    send.mockResolvedValue({
      FaceMatches: [{ Similarity: 42.13 }, { Similarity: 97.46 }],
      UnmatchedFaces: [],
    });
    await expect(compareFaces(a, b)).resolves.toEqual({
      status: 'compared',
      similarity: 97.5,
    });
  });

  it('says so when the ID photo has no face', async () => {
    send.mockResolvedValue({ FaceMatches: [], UnmatchedFaces: [] });
    await expect(compareFaces(a, b)).resolves.toEqual({
      status: 'no_face_id',
      similarity: null,
    });
  });

  it('says so when the face photo has no face', async () => {
    send.mockRejectedValue(
      new (InvalidParameterException as unknown as new () => Error)(),
    );
    await expect(compareFaces(a, b)).resolves.toEqual({
      status: 'no_face_selfie',
      similarity: null,
    });
  });

  it('never throws when the service fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    send.mockRejectedValue(new Error('timeout'));
    await expect(compareFaces(a, b)).resolves.toMatchObject({
      status: 'error',
      similarity: null,
    });
  });
});

describe('faceMatchEnabled', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('needs both the switch and the AWS keys', () => {
    process.env.AWS_ACCESS_KEY_ID = 'x';
    process.env.AWS_SECRET_ACCESS_KEY = 'y';
    delete process.env.FACE_MATCH_ENABLED;
    expect(faceMatchEnabled()).toBe(false);
    process.env.FACE_MATCH_ENABLED = 'true';
    expect(faceMatchEnabled()).toBe(true);
    delete process.env.AWS_SECRET_ACCESS_KEY;
    expect(faceMatchEnabled()).toBe(false);
  });
});

describe('testFaceMatchConnection', () => {
  const env = { ...process.env };
  const failWith = (name: string) => {
    const error = new Error(name);
    error.name = name;
    send.mockRejectedValue(error);
  };
  beforeEach(() => {
    send.mockReset();
    process.env.AWS_ACCESS_KEY_ID = 'x';
    process.env.AWS_SECRET_ACCESS_KEY = 'y';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('counts "no face in the image" as a working connection', async () => {
    send.mockRejectedValue(
      new (InvalidParameterException as unknown as new () => Error)(),
    );
    await expect(testFaceMatchConnection()).resolves.toMatchObject({
      connection: 'ok',
    });
  });

  it('tells wrong keys, a missing permission and other failures apart', async () => {
    failWith('UnrecognizedClientException');
    await expect(testFaceMatchConnection()).resolves.toMatchObject({
      connection: 'bad_keys',
    });
    failWith('AccessDeniedException');
    await expect(testFaceMatchConnection()).resolves.toMatchObject({
      connection: 'no_permission',
    });
    failWith('TimeoutError');
    await expect(testFaceMatchConnection()).resolves.toMatchObject({
      connection: 'unreachable',
    });
  });

  it('says when the keys are missing, without calling AWS', async () => {
    delete process.env.AWS_SECRET_ACCESS_KEY;
    await expect(testFaceMatchConnection()).resolves.toMatchObject({
      connection: 'missing_keys',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends a generated image, never a photo', async () => {
    send.mockRejectedValue(
      new (InvalidParameterException as unknown as new () => Error)(),
    );
    await testFaceMatchConnection();
    const input = (
      send.mock.calls[0] as [{ input: { SourceImage: { Bytes: Buffer } } }]
    )[0].input;
    expect(input.SourceImage.Bytes.subarray(1, 4).toString()).toBe('PNG');
  });
});
