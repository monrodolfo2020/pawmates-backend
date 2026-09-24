import { ProviderVerification } from './entities/provider-verification.entity';
import { applyFaceMatch, photoFeedback } from './face-match';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('applyFaceMatch', () => {
  const env = { ...process.env };
  const verification = () => {
    const v = new ProviderVerification();
    v.facePhotoBase64 = PNG;
    v.idDocumentPhotoBase64 = PNG;
    v.faceMatchStatus = null;
    v.faceMatchSimilarity = null;
    v.faceMatchCheckedAt = null;
    return v;
  };
  beforeEach(() => {
    process.env.FACE_MATCH_ENABLED = 'true';
    process.env.AWS_ACCESS_KEY_ID = 'x';
    process.env.AWS_SECRET_ACCESS_KEY = 'y';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('records the result on the verification', async () => {
    const v = verification();
    const compare = jest
      .fn()
      .mockResolvedValue({ status: 'compared', similarity: 96.2 });
    await applyFaceMatch(v, compare);
    expect(compare).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Buffer),
    );
    expect(v.faceMatchStatus).toBe('compared');
    expect(v.faceMatchSimilarity).toBe(96.2);
    expect(v.faceMatchCheckedAt).toBeInstanceOf(Date);
  });

  it('does nothing while switched off', async () => {
    delete process.env.FACE_MATCH_ENABLED;
    const v = verification();
    const compare = jest.fn();
    await applyFaceMatch(v, compare);
    expect(compare).not.toHaveBeenCalled();
    expect(v.faceMatchCheckedAt).toBeNull();
  });

  it('marks an error instead of throwing when a photo cannot be read', async () => {
    const v = verification();
    v.idDocumentPhotoBase64 = null;
    await applyFaceMatch(v, jest.fn());
    expect(v.faceMatchStatus).toBe('error');
  });
});

describe('photoFeedback', () => {
  const v = (
    status: 'pending' | 'verified',
    faceMatchStatus: string | null,
    faceMatchSimilarity: number | null,
  ) => ({ status, faceMatchStatus, faceMatchSimilarity }) as never;

  it('tells the business which photo to retake, or that the faces differ', () => {
    expect(photoFeedback(v('pending', 'no_face_selfie', null))).toBe(
      'retake_selfie',
    );
    expect(photoFeedback(v('pending', 'no_face_id', null))).toBe('retake_id');
    expect(photoFeedback(v('pending', 'compared', 41))).toBe('mismatch');
  });

  it('says nothing when the faces match, the check failed, or it was already decided', () => {
    expect(photoFeedback(v('pending', 'compared', 72))).toBeNull();
    expect(photoFeedback(v('pending', 'error', null))).toBeNull();
    expect(photoFeedback(v('pending', null, null))).toBeNull();
    expect(photoFeedback(v('verified', 'compared', 20))).toBeNull();
    expect(photoFeedback(null)).toBeNull();
  });
});
