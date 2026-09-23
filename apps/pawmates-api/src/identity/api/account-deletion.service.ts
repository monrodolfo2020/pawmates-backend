import {
  ResourceNotFoundError,
  ValidationError,
  deleteStoredPhoto,
} from '@pawmates/common';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AccountStatusAdapter } from '../infra/adapters/account-status.adapter';

export type DeletionSummary = {
  accountId: string;
  email: string;
  photosDeleted: number;
};

/**
 * Permanently deletes an account.
 *
 * "Permanently" means everything that belongs to that person alone is
 * gone, and cannot be brought back. It does not mean every row that
 * mentions them, because three kinds of record are not theirs alone to
 * erase, and each is kept for a reason that outlives the account:
 *
 * - **Bookings and their messages** are shared with the other party. A
 *   dog owner who deletes their account doesn't get to erase the walk a
 *   paseador did, or the conversation it had about it. Those rows keep
 *   an id that no longer resolves to anyone, and render as a deleted
 *   account.
 * - **VIP payment records** (providers_plan_activations) are fiscal
 *   records the law requires be kept for five years.
 * - **The record of what was accepted** (identity_legal_acceptances) is
 *   the evidence of consent if a dispute ever comes up.
 *
 * Everything else goes: the account, its pets, its business page (which
 * also frees its link), its identity verification, its pending email
 * and password-reset codes, and — as location data that belongs to the
 * walker — the GPS trail of walks it did as a paseador. Photos are
 * removed from storage too.
 *
 * The privacy notice (section 8.5) already tells people that data the
 * law requires can't always be cancelled; this is that promise in code.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly accountStatus: AccountStatusAdapter,
  ) {}

  async delete(params: {
    accountId: string;
    confirmEmail: string;
    requestedBy: string;
  }): Promise<DeletionSummary> {
    if (params.accountId === params.requestedBy) {
      throw new ValidationError('No puedes eliminar tu propia cuenta desde el panel.');
    }

    const [account] = (await this.dataSource.query(
      `SELECT id, email, roles FROM identity_accounts WHERE id = ?`,
      [params.accountId],
    )) as { id: string; email: string; roles: string }[];
    if (!account) {
      throw new ResourceNotFoundError('Esa cuenta no existe.');
    }

    // Admins are never deleted from here: losing the last one would lock
    // everybody out of this panel, and there's no signup path that makes
    // a new one. Remove the role by hand first if it's really meant.
    const roles = JSON.parse(account.roles ?? '[]') as string[];
    if (roles.includes('admin')) {
      throw new ValidationError(
        'Las cuentas de administrador no se eliminan desde el panel.',
      );
    }

    // The same check the screen does, repeated here: a misclick, a
    // replayed request or a buggy client must not be enough to erase
    // someone.
    if (params.confirmEmail.trim().toLowerCase() !== account.email.toLowerCase()) {
      throw new ValidationError(
        'El correo de confirmación no coincide con el de la cuenta.',
      );
    }

    // Collected before anything is deleted: once the rows are gone there
    // is no record of which objects in storage belonged to them.
    const photos = await this.collectPhotos(params.accountId);

    await this.dataSource.transaction(async (manager) => {
      await this.deleteRows(manager, params.accountId);
    });

    // After the commit, never before: deleting an image and then failing
    // to delete its row would leave a row pointing at nothing, while the
    // reverse only leaves an orphaned object in storage.
    await Promise.all(photos.map((p) => deleteStoredPhoto(p)));

    this.accountStatus.forget(params.accountId);

    return {
      accountId: params.accountId,
      email: account.email,
      photosDeleted: photos.length,
    };
  }

  private async deleteRows(manager: EntityManager, accountId: string): Promise<void> {
    const q = (sql: string) => manager.query(sql, [accountId]);

    // The walker's GPS trail, for walks it did as a paseador. The booking
    // itself stays — it's the owner's record too — but where this person
    // was, minute by minute, is theirs.
    await q(
      `DELETE FROM booking_trip_locations
         WHERE booking_id IN (SELECT id FROM booking_bookings WHERE provider_id = ?)`,
    );
    await q(`DELETE FROM identity_pets WHERE owner_id = ?`);
    await q(`DELETE FROM identity_provider_verifications WHERE account_id = ?`);
    await q(`DELETE FROM identity_email_verification_codes WHERE account_id = ?`);
    await q(`DELETE FROM identity_password_reset_tokens WHERE account_id = ?`);
    await q(`DELETE FROM providers_profiles WHERE account_id = ?`);
    await q(`DELETE FROM identity_accounts WHERE id = ?`);
  }

  private async collectPhotos(accountId: string): Promise<string[]> {
    const found: string[] = [];
    const add = (value: unknown) => {
      if (typeof value === 'string' && value) found.push(value);
    };

    const profiles = (await this.dataSource.query(
      `SELECT photo_base64, photos, design_draft, design_published
         FROM providers_profiles WHERE account_id = ?`,
      [accountId],
    )) as Record<string, string | null>[];
    for (const p of profiles) {
      add(p.photo_base64);
      for (const uri of safeJson<string[]>(p.photos) ?? []) add(uri);
      for (const design of [p.design_draft, p.design_published]) {
        const d = safeJson<{ logo?: string; cover?: string }>(design);
        add(d?.logo);
        add(d?.cover);
      }
    }

    const pets = (await this.dataSource.query(
      `SELECT photo_base64 FROM identity_pets WHERE owner_id = ?`,
      [accountId],
    )) as { photo_base64: string | null }[];
    for (const pet of pets) add(pet.photo_base64);

    const verifications = (await this.dataSource.query(
      `SELECT face_photo_base64, id_document_photo_base64
         FROM identity_provider_verifications WHERE account_id = ?`,
      [accountId],
    )) as { face_photo_base64: string | null; id_document_photo_base64: string | null }[];
    for (const v of verifications) {
      add(v.face_photo_base64);
      add(v.id_document_photo_base64);
    }

    // The same image can be both the profile photo and the first gallery
    // photo; deleting it twice is harmless but pointless.
    return [...new Set(found)];
  }
}

function safeJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
