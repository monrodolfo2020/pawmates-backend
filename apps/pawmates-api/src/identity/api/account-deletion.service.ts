import {
  ResourceNotFoundError,
  ValidationError,
  deleteStoredPhoto,
} from '@pawmates/common';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Account } from '../domain/entities/account.entity';
import { EmailVerificationCode } from '../domain/entities/email-verification-code.entity';
import { PasswordResetToken } from '../domain/entities/password-reset-token.entity';
import { Pet } from '../domain/entities/pet.entity';
import { ProviderVerification } from '../domain/entities/provider-verification.entity';
import { ProviderProfile } from '../../providers/domain/entities/provider-profile.entity';
import { Booking } from '../../booking/domain/entities/booking.entity';
import { TripLocation } from '../../booking/domain/entities/trip-location.entity';
import { AccountStatusAdapter } from '../infra/adapters/account-status.adapter';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';

export type DeletionSummary = {
  accountId: string;
  email: string;
  photosDeleted: number;
};

/**
 * What deleting an account does to every table in the database — each
 * one decided on purpose. account-deletion.integration.spec.ts fails
 * when a table exists that isn't listed here, so a new table can't hold
 * someone's data past their deletion just because nobody thought of it.
 */
export const TABLES_ON_ACCOUNT_DELETION: Record<string, string> = {
  // Deleted: theirs alone.
  identity_accounts: 'deleted',
  identity_pets: 'deleted',
  identity_provider_verifications: 'deleted',
  identity_email_verification_codes: 'deleted',
  identity_password_reset_tokens: 'deleted',
  providers_profiles: 'deleted',
  booking_trip_locations:
    'deleted for walks they did as a business (where they were)',
  rate_limits: 'deleted (counters keyed by their email or id)',

  // Kept: shared with someone else, or required.
  booking_bookings: 'kept: shared with the other party',
  booking_booking_lines: 'kept: part of the booking',
  booking_price_breakdowns: 'kept: part of the booking',
  booking_messages: 'kept: shared with the other party',
  booking_walk_events: "kept: the walk's log belongs to the booking",
  booking_cancellation_records: 'kept: part of the booking',
  booking_reschedule_requests: 'kept: part of the booking',
  booking_recurrence_series: 'kept: part of the bookings it created',
  providers_plan_activations:
    'kept: payment records the law requires for five years',
  identity_legal_acceptances: 'kept: evidence of consent',

  // Not anyone's personal data.
  providers_plan_codes: 'not personal: activation codes',
  booking_outbox_events: 'not personal: event log of booking changes',
  idempotency_keys:
    'not personal: short-lived request cache that expires on its own',
  migrations_pawmates: 'not personal: schema history',

  // The store is paused (docs/tienda.md). Its code is gone, so nothing
  // writes these; decide what a deletion does to them when it returns.
  commerce_storefronts: 'kept while the store is paused',
  commerce_products: 'kept while the store is paused',
  commerce_catalog_items: 'not personal: the catalogue',
  commerce_orders: 'kept while the store is paused',
  commerce_order_line_items: 'kept while the store is paused',
  commerce_outbox_events: 'not personal: event log',
};

/** SQLite caps the parameters in one statement; ids go in batches. */
const BATCH = 500;

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
    private readonly limiter: RateLimiter,
  ) {}

  async delete(params: {
    accountId: string;
    confirmEmail: string;
    requestedBy: string;
  }): Promise<DeletionSummary> {
    if (params.accountId === params.requestedBy) {
      throw new ValidationError(
        'No puedes eliminar tu propia cuenta desde el panel.',
      );
    }

    const account = await this.dataSource.getRepository(Account).findOne({
      where: { id: params.accountId },
    });
    if (!account) {
      throw new ResourceNotFoundError('Esa cuenta no existe.');
    }

    // Admins are never deleted from here: losing the last one would lock
    // everybody out of this panel, and there's no signup path that makes
    // a new one. Remove the role by hand first if it's really meant.
    if (account.roles.includes('admin')) {
      throw new ValidationError(
        'Las cuentas de administrador no se eliminan desde el panel.',
      );
    }

    // The same check the screen does, repeated here: a misclick, a
    // replayed request or a buggy client must not be enough to erase
    // someone.
    if (
      params.confirmEmail.trim().toLowerCase() !== account.email.toLowerCase()
    ) {
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

    // Their login/email counters: keyed by email or account id, so they
    // are personal data too. Outside the transaction — best effort, a
    // counter left behind expires on its own.
    await Promise.all(
      [account.email, params.accountId].map((subject) =>
        this.limiter.forgetSubject(subject).catch(() => undefined),
      ),
    );

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

  private async deleteRows(
    manager: EntityManager,
    accountId: string,
  ): Promise<void> {
    // The walker's GPS trail, for walks it did as a business. The booking
    // itself stays — it's the owner's record too — but where this person
    // was, minute by minute, is theirs.
    const walked = await manager.find(Booking, {
      select: { id: true },
      where: { providerId: accountId },
    });
    const bookingIds = walked.map((b) => b.id);
    for (let i = 0; i < bookingIds.length; i += BATCH) {
      await manager.delete(TripLocation, {
        bookingId: In(bookingIds.slice(i, i + BATCH)),
      });
    }

    await manager.delete(Pet, { ownerId: accountId });
    await manager.delete(ProviderVerification, { accountId });
    await manager.delete(EmailVerificationCode, { accountId });
    await manager.delete(PasswordResetToken, { accountId });
    await manager.delete(ProviderProfile, { accountId });
    await manager.delete(Account, { id: accountId });
  }

  /** Every stored image of theirs, read before the rows go — afterwards
   * there's no record of which objects in storage were theirs. */
  private async collectPhotos(accountId: string): Promise<string[]> {
    const found: (string | null | undefined)[] = [];

    const profiles = await this.dataSource
      .getRepository(ProviderProfile)
      .find({ where: { accountId } });
    for (const p of profiles) {
      found.push(p.photoBase64, ...(p.photosJson ?? []));
      for (const design of [p.designDraft, p.designPublished]) {
        found.push(design?.logo, design?.cover);
      }
    }

    const pets = await this.dataSource
      .getRepository(Pet)
      .find({ where: { ownerId: accountId } });
    found.push(...pets.map((pet) => pet.photoBase64));

    const verifications = await this.dataSource
      .getRepository(ProviderVerification)
      .find({ where: { accountId } });
    for (const v of verifications)
      found.push(v.facePhotoBase64, v.idDocumentPhotoBase64);

    // The same image can be both the profile photo and the first gallery
    // photo; deleting it twice is harmless but pointless.
    return [
      ...new Set(
        found.filter(
          (uri): uri is string => typeof uri === 'string' && uri !== '',
        ),
      ),
    ];
  }
}
