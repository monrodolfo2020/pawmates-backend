import { ProviderVerification } from './entities/provider-verification.entity';
import {
  applyFaceMatch,
  emailPhotoFeedback,
  photoFeedback,
} from './face-match';

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

describe('emailPhotoFeedback', () => {
  const pending = (
    faceMatchStatus: string | null,
    faceMatchSimilarity: number | null,
  ) => ({ status: 'pending', faceMatchStatus, faceMatchSimilarity }) as never;
  const to = { email: 'lulu@t.app', businessName: 'Estética <Lulú>' };

  it('emails the business when the faces do not match, without the percentage', async () => {
    const send = jest.fn().mockResolvedValue({ sent: true });
    await expect(
      emailPhotoFeedback(pending('compared', 41.7), to, send),
    ).resolves.toBe(true);
    const [email, content] = send.mock.calls[0] as [
      string,
      { subject: string; html: string },
    ];
    expect(email).toBe('lulu@t.app');
    expect(content.subject).toBe(
      'Revisa las fotos de tu verificación en PawMates',
    );
    expect(content.html).toContain('Estética &lt;Lulú&gt;');
    expect(content.html).not.toMatch(/41|%/);
  });

  it('asks for a new photo when one had no face', async () => {
    const send = jest.fn().mockResolvedValue({ sent: true });
    await emailPhotoFeedback(pending('no_face_id', null), to, send);
    const [, content] = send.mock.calls[0] as [
      string,
      { subject: string; html: string },
    ];
    expect(content.subject).toBe(
      'Necesitamos otra foto para verificar tu identidad',
    );
    expect(content.html).toContain('identificación');
  });

  it('sends nothing when there is nothing to fix', async () => {
    const send = jest.fn();
    await expect(
      emailPhotoFeedback(pending('compared', 95), to, send),
    ).resolves.toBe(false);
    await emailPhotoFeedback(pending(null, null), to, send);
    expect(send).not.toHaveBeenCalled();
  });
});
