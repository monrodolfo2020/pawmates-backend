import { ProviderVerification } from './entities/provider-verification.entity';
import { applyFaceMatch } from './face-match';

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
    const compare = jest.fn().mockResolvedValue({ status: 'compared', similarity: 96.2 });
    await applyFaceMatch(v, compare);
    expect(compare).toHaveBeenCalledWith(expect.any(Buffer), expect.any(Buffer));
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
