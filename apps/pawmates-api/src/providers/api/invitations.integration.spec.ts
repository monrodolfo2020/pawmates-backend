import 'reflect-metadata';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { ValidationError } from '@pawmates/common';
import pawmatesDataSource from '../../infra/persistence/data-source';
import { Account } from '../../identity/domain/entities/account.entity';
import { BusinessInvitation } from '../domain/entities/business-invitation.entity';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { InvitationsController } from './invitations.controller';

/** Against the real schema: preparing pages, previewing one by its link
 * and a business claiming it. */
const TEST_DB_FILE = './invitations.integration.test.db';
const provider = (accountId: string) => ({
  accountId,
  roles: ['provider'],
  activeContext: 'provider' as const,
});

describe('InvitationsController (integration)', () => {
  let db: DataSource;
  let controller: InvitationsController;

  beforeAll(async () => {
    fs.rmSync(TEST_DB_FILE, { force: true });
    db = new DataSource({
      ...pawmatesDataSource.options,
      database: TEST_DB_FILE,
    } as never);
    await db.initialize();
    await db.runMigrations();
    controller = new InvitationsController(
      db.getRepository(BusinessInvitation),
      db.getRepository(ProviderProfile),
      db.getRepository(Account),
    );
  });

  afterAll(async () => {
    await db.destroy();
    fs.rmSync(TEST_DB_FILE, { force: true });
  });

  it('creates a whole list, or nothing when one line is wrong', async () => {
    await expect(
      controller.create({
        invitations: [
          { businessName: 'Bien', category: 'vet' },
          { businessName: 'Mal', category: 'tienda' },
        ],
      }),
    ).rejects.toThrow('Renglón 2');
    expect(await db.getRepository(BusinessInvitation).count()).toBe(0);

    const { data } = await controller.create({
      invitations: [
        {
          businessName: '  Vet Patitas ',
          category: 'vet',
          publicAddress: 'Av. Hidalgo 10, Toluca',
          whatsapp: '722 123 4567',
          hours: '',
        },
        {
          businessName: 'Guau Spa',
          category: 'grooming',
          bio: 'Baño y corte.',
        },
      ],
    });
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      businessName: 'Vet Patitas',
      hours: null,
      bio: expect.stringContaining('Atención veterinaria'),
      claimedAt: null,
    });
    expect(data[0].token).not.toBe(data[1].token);
    expect((await controller.list()).data).toHaveLength(2);
  });

  it('shows the prepared page to whoever has the link, and only them', async () => {
    const [inv] = (
      await controller.create({
        invitations: [{ businessName: 'Preview', category: 'boarding' }],
      })
    ).data;
    const { data } = await controller.preview(inv.token);
    expect(data.claimed).toBe(false);
    expect(data.page).toMatchObject({
      name: 'Preview',
      slug: null,
      bio: expect.stringContaining('Hospedaje y cuidado'),
    });
    await expect(controller.preview('no-existe-123')).rejects.toThrow(
      'no existe',
    );
    // Never in the directory: it isn't a business page at all yet.
    expect(await db.getRepository(ProviderProfile).count()).toBe(0);
  });

  it('gives the page to the business that claims it, keeping what the business wrote', async () => {
    const [inv] = (
      await controller.create({
        invitations: [
          {
            businessName: 'Estética Firulais',
            category: 'grooming',
            whatsapp: '7221112233',
            hours: 'L-V 9 a 18',
          },
        ],
      })
    ).data;
    const profile = ProviderProfile.draft('acct-claimer');
    profile.update({
      category: 'grooming',
      businessName: 'Firulais Spa',
      hours: 'Diario',
    });
    await db.getRepository(ProviderProfile).save(profile);

    await controller.claim(inv.token, provider('acct-claimer'));

    const saved = await db
      .getRepository(ProviderProfile)
      .findOneByOrFail({ accountId: 'acct-claimer' });
    expect(saved.businessName).toBe('Firulais Spa');
    expect(saved.hours).toBe('Diario');
    expect(saved.whatsapp).toBe('7221112233');
    expect(saved.bio).toContain('Baño y estética');
    expect(saved.isPublished).toBe(true);
    // Complete, but still waiting for the usual approval.
    expect(saved.isPubliclyVisible).toBe(false);
    expect(saved.slug).toBe('firulais-spa');

    // Again by the same business: fine. By another: refused.
    await controller.claim(inv.token, provider('acct-claimer'));
    await expect(
      controller.claim(inv.token, provider('acct-other')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await controller.preview(inv.token)).data.claimed).toBe(true);
    await expect(controller.remove(inv.id)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('needs a business account to claim, and lets an admin delete an unclaimed one', async () => {
    const [inv] = (
      await controller.create({
        invitations: [{ businessName: 'Borrable', category: 'other' }],
      })
    ).data;
    await expect(
      controller.claim(inv.token, { ...provider('owner-1'), roles: ['owner'] }),
    ).rejects.toThrow('cuenta de negocio');
    await controller.remove(inv.id);
    await expect(controller.preview(inv.token)).rejects.toThrow('no existe');
  });
});
