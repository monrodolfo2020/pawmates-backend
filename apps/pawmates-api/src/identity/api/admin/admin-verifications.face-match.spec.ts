import { ValidationError } from '@pawmates/common';
import { AdminVerificationsController } from './admin-verifications.controller';

/** "Comparar rostros" only runs on photos sent under the consent that
 * covers the automated comparison. */
describe('AdminVerificationsController.faceMatch', () => {
  const env = { ...process.env };
  const verification = {
    id: 'v1',
    accountId: 'acc-1',
    status: 'pending',
    facePhotoBase64: 'data:image/png;base64,iVBORw0KGgo=',
    idDocumentPhotoBase64: 'data:image/png;base64,iVBORw0KGgo=',
  };
  const controller = (acceptances: unknown[]) =>
    new AdminVerificationsController(
      {
        findOne: jest.fn().mockResolvedValue({ ...verification }),
        save: jest.fn(),
      } as never,
      {} as never,
      {} as never,
      { find: jest.fn().mockResolvedValue(acceptances) } as never,
    );

  beforeEach(() => {
    process.env.FACE_MATCH_ENABLED = 'true';
    process.env.AWS_ACCESS_KEY_ID = 'x';
    process.env.AWS_SECRET_ACCESS_KEY = 'y';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('refuses photos sent under an older consent', async () => {
    await expect(controller([]).faceMatch('v1')).rejects.toThrow(
      ValidationError,
    );
    await expect(controller([]).faceMatch('v1')).rejects.toThrow(
      /consentimiento/,
    );
  });
});
