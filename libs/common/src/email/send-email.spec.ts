import { escapeHtml, sendEmail, senderFields } from './send-email';

describe('sendEmail', () => {
  const OLD = { ...process.env };
  beforeEach(() =>
    jest.spyOn(console, 'error').mockImplementation(() => undefined),
  );
  afterEach(() => {
    process.env = { ...OLD };
    jest.restoreAllMocks();
  });

  const respond = (status: number, body = '') => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
    });
  };

  it('reports success', async () => {
    process.env.RESEND_API_KEY = 'k';
    respond(200);
    await expect(
      sendEmail({ to: 'a@b.mx', subject: 's', html: 'h' }),
    ).resolves.toEqual({ sent: true });
  });

  it('sends from EMAIL_FROM, with replies going to EMAIL_REPLY_TO', async () => {
    process.env.RESEND_API_KEY = 'k';
    process.env.EMAIL_FROM = 'PawMates <notificaciones@bosquedelsaber.com>';
    process.env.EMAIL_REPLY_TO = 'rmonterrozag@gmail.com';
    respond(200);
    await sendEmail({ to: 'a@b.mx', subject: 's', html: 'h' });
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as {
      body: string;
    };
    expect(JSON.parse(init.body)).toMatchObject({
      from: 'PawMates <notificaciones@bosquedelsaber.com>',
      reply_to: 'rmonterrozag@gmail.com',
    });
  });

  it('leaves replies alone when EMAIL_REPLY_TO is unset', () => {
    delete process.env.EMAIL_REPLY_TO;
    process.env.EMAIL_FROM = 'PawMates <a@b.mx>';
    expect(senderFields()).toEqual({ from: 'PawMates <a@b.mx>' });
  });

  it('reports a failure instead of throwing, so it can never break what called it', async () => {
    process.env.RESEND_API_KEY = 'k';
    respond(500, 'boom');
    const result = await sendEmail({ to: 'a@b.mx', subject: 's', html: 'h' });
    expect(result.sent).toBe(false);
  });

  it('explains the test-sender restriction people actually hit', async () => {
    process.env.RESEND_API_KEY = 'k';
    respond(403, 'You can only send testing emails to your own email address');
    const result = await sendEmail({
      to: 'prestador@b.mx',
      subject: 's',
      html: 'h',
    });
    expect(result).toMatchObject({ sent: false });
    expect(result.sent === false && result.reason).toMatch(/EMAIL_FROM/);
  });

  it('reports a network failure instead of throwing', async () => {
    process.env.RESEND_API_KEY = 'k';
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(
      sendEmail({ to: 'a@b.mx', subject: 's', html: 'h' }),
    ).resolves.toMatchObject({
      sent: false,
    });
  });

  it('says so when no key is configured', async () => {
    delete process.env.RESEND_API_KEY;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(
      sendEmail({ to: 'a@b.mx', subject: 's', html: 'h' }),
    ).resolves.toMatchObject({
      sent: false,
    });
  });
});

describe('escapeHtml', () => {
  it('keeps a business name from being read as markup in an email', () => {
    expect(escapeHtml('<b>Vet</b> "Luna" & co')).toBe(
      '&lt;b&gt;Vet&lt;/b&gt; &quot;Luna&quot; &amp; co',
    );
  });
});
