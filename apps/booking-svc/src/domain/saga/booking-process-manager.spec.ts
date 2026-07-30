import {
  Money,
  PaymentCardDeclinedError,
  ResourceNotFoundError,
  ValidationError,
} from '@pawmates/common';
import { DataSource, Repository } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { RecurrenceSeries } from '../entities/recurrence-series.entity';
import type { MarketplacePort } from '../ports/marketplace.port';
import type { PaymentsPort } from '../ports/payments.port';
import type { TrustSafetyPort } from '../ports/trust-safety.port';
import { NoDoubleBookingPolicy } from '../policies/no-double-booking.policy';
import { BookingProcessManager } from './booking-process-manager';
import { BookingStatus } from '../value-objects/booking-status';

describe('BookingProcessManager', () => {
  let manager: BookingProcessManager;
  let bookingsRepo: jest.Mocked<Pick<Repository<Booking>, 'findOne' | 'save'>>;
  let recurrenceRepo: jest.Mocked<Pick<Repository<RecurrenceSeries>, 'save'>>;
  let marketplace: jest.Mocked<MarketplacePort>;
  let trustSafety: jest.Mocked<TrustSafetyPort>;
  let payments: jest.Mocked<PaymentsPort>;
  let noDoubleBooking: jest.Mocked<
    Pick<NoDoubleBookingPolicy, 'assertAvailable'>
  >;
  let txManagerSave: jest.Mock;
  let dataSource: DataSource;

  const availability = {
    available: true,
    providerId: 'provider-1',
    rate: Money.of(5000, 'USD'),
    commission: Money.of(500, 'USD'),
    tax: Money.of(0, 'USD'),
  };

  beforeEach(() => {
    bookingsRepo = { findOne: jest.fn(), save: jest.fn() };
    recurrenceRepo = { save: jest.fn((s) => Promise.resolve(s)) };
    marketplace = {
      checkAvailability: jest.fn().mockResolvedValue(availability),
    };
    trustSafety = {
      checkVerificationValid: jest
        .fn()
        .mockResolvedValue({ valid: true, expiresAt: new Date() }),
    };
    payments = {
      authorizePayment: jest.fn(),
      capturePayment: jest.fn(),
    };
    noDoubleBooking = {
      assertAvailable: jest.fn().mockResolvedValue(undefined),
    };

    txManagerSave = jest.fn();
    const txManager = { save: txManagerSave };
    dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) =>
        cb(txManager),
      ),
      manager: { save: jest.fn() },
    } as unknown as DataSource;

    manager = new BookingProcessManager(
      dataSource,
      bookingsRepo as unknown as Repository<Booking>,
      recurrenceRepo as unknown as Repository<RecurrenceSeries>,
      marketplace,
      trustSafety,
      payments,
      noDoubleBooking as unknown as NoDoubleBookingPolicy,
    );
  });

  const cmd = {
    ownerId: 'owner-1',
    providerServiceId: 'svc-1',
    scheduledAt: new Date('2026-08-01T12:00:00Z'),
    idempotencyKey: 'idem-1',
    lines: [
      {
        petId: 'pet-1',
        serviceTypeCode: 'walk',
        durationValue: 30,
        durationUnit: 'min' as const,
        addressId: 'addr-1',
      },
    ],
  };

  describe('createBooking', () => {
    it('validates availability and verification, then persists Requested + outbox', async () => {
      bookingsRepo.findOne.mockResolvedValue(null);

      const booking = await manager.createBooking(cmd, 'trace-1');

      expect(marketplace.checkAvailability).toHaveBeenCalledWith({
        providerServiceId: cmd.providerServiceId,
        scheduledAt: cmd.scheduledAt,
        durationMinutes: 30,
      });
      expect(trustSafety.checkVerificationValid).toHaveBeenCalled();
      expect(noDoubleBooking.assertAvailable).toHaveBeenCalledWith(
        'provider-1',
        cmd.scheduledAt,
        30,
      );
      expect(booking.status).toBe(BookingStatus.Requested);
      expect(booking.providerId).toBe('provider-1');

      // Booking + PriceBreakdown + outbox event all saved in one transaction.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(txManagerSave).toHaveBeenCalledWith(Booking, expect.any(Booking));
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ eventType: 'BookingCreated' }),
      );
    });

    it('is idempotent: replays the same Booking on a repeated idempotency key', async () => {
      const existing = makeExistingBooking();
      bookingsRepo.findOne.mockResolvedValue(existing);

      const result = await manager.createBooking(cmd, 'trace-1');

      expect(result).toBe(existing);
      expect(marketplace.checkAvailability).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a booking with no lines before calling any dependency', async () => {
      bookingsRepo.findOne.mockResolvedValue(null);

      await expect(
        manager.createBooking({ ...cmd, lines: [] }, 'trace-1'),
      ).rejects.toThrow(ValidationError);
      expect(marketplace.checkAvailability).not.toHaveBeenCalled();
    });

    it('rejects when the provider has no availability', async () => {
      bookingsRepo.findOne.mockResolvedValue(null);
      marketplace.checkAvailability.mockResolvedValue({
        ...availability,
        available: false,
      });

      await expect(manager.createBooking(cmd, 'trace-1')).rejects.toThrow(
        ValidationError,
      );
      expect(trustSafety.checkVerificationValid).not.toHaveBeenCalled();
    });

    it('rejects when the provider lacks a valid verification', async () => {
      bookingsRepo.findOne.mockResolvedValue(null);
      trustSafety.checkVerificationValid.mockResolvedValue({
        valid: false,
        expiresAt: new Date(),
      });

      await expect(manager.createBooking(cmd, 'trace-1')).rejects.toThrow(
        ValidationError,
      );
      expect(noDoubleBooking.assertAvailable).not.toHaveBeenCalled();
    });
  });

  describe('acceptBooking', () => {
    it('authorizes payment then confirms the booking (Policy P-16)', async () => {
      const booking = makeExistingBooking();
      bookingsRepo.findOne.mockResolvedValue(booking);
      payments.authorizePayment.mockResolvedValue({
        transactionId: 'tx-1',
        status: 'authorized',
      });

      const result = await manager.acceptBooking(booking.id, 'pm-1', 'trace-1');

      expect(result.status).toBe(BookingStatus.Confirmed);
      expect(txManagerSave).toHaveBeenCalledWith(Booking, expect.any(Booking));
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ eventType: 'ProviderAccepted' }),
      );
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ eventType: 'BookingConfirmed' }),
      );
    });

    it('never confirms the booking when authorization fails', async () => {
      const booking = makeExistingBooking();
      bookingsRepo.findOne.mockResolvedValue(booking);
      payments.authorizePayment.mockResolvedValue({
        transactionId: 'tx-1',
        status: 'failed',
      });

      await expect(
        manager.acceptBooking(booking.id, 'pm-1', 'trace-1'),
      ).rejects.toThrow(PaymentCardDeclinedError);
      expect(booking.status).toBe(BookingStatus.Requested);
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({
          eventType: 'BookingPaymentAuthorizationFailed',
        }),
      );
    });

    it('throws ResourceNotFoundError for an unknown booking', async () => {
      bookingsRepo.findOne.mockResolvedValue(null);
      await expect(
        manager.acceptBooking('missing', 'pm-1', 'trace-1'),
      ).rejects.toThrow(ResourceNotFoundError);
    });
  });

  describe('cancelBooking', () => {
    it('computes the cancellation penalty via CancellationPolicy and emits BookingCancelled', async () => {
      const booking = makeExistingBooking();
      booking.scheduledAt = new Date(Date.now() + 60 * 60 * 1000); // 1h from now (< 2h free window)
      bookingsRepo.findOne.mockResolvedValue(booking);

      const result = await manager.cancelBooking(
        booking.id,
        'owner-1',
        'change of plans',
        'trace-1',
      );

      expect(result.status).toBe(BookingStatus.Cancelled);
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({
          eventType: 'BookingCancelled',
          payload: expect.objectContaining({ penaltyAmount: 2500 }),
        }),
      );
    });

    it('refuses to cancel an in-progress booking', async () => {
      const booking = makeExistingBooking();
      booking.status = BookingStatus.InProgress;
      bookingsRepo.findOne.mockResolvedValue(booking);

      await expect(
        manager.cancelBooking(booking.id, 'owner-1', null, 'trace-1'),
      ).rejects.toThrow(/no puedes cancelar/i);
    });
  });

  describe('rejectBooking', () => {
    it('cancels with zero penalty and emits BookingCancelled', async () => {
      const booking = makeExistingBooking();
      bookingsRepo.findOne.mockResolvedValue(booking);

      const result = await manager.rejectBooking(
        booking.id,
        'provider-1',
        'not available',
        'trace-1',
      );

      expect(result.status).toBe(BookingStatus.Cancelled);
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({
          eventType: 'BookingCancelled',
          payload: expect.objectContaining({ cancelledBy: 'provider-1' }),
        }),
      );
    });
  });

  describe('markInProgress / completeService', () => {
    it('markInProgress transitions Confirmed -> InProgress and saves directly', async () => {
      const booking = makeExistingBooking();
      booking.status = BookingStatus.Confirmed;
      bookingsRepo.findOne.mockResolvedValue(booking);

      await manager.markInProgress(booking.id);

      expect(booking.status).toBe(BookingStatus.InProgress);
      expect(bookingsRepo.save).toHaveBeenCalledWith(booking);
    });

    it('completeService captures payment and emits WalkFinished', async () => {
      const booking = makeExistingBooking();
      booking.status = BookingStatus.InProgress;
      bookingsRepo.findOne.mockResolvedValue(booking);
      payments.capturePayment.mockResolvedValue({ status: 'captured' });

      await manager.completeService(booking.id, 'trace-1');

      expect(booking.status).toBe(BookingStatus.Completed);
      expect(payments.capturePayment).toHaveBeenCalled();
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({
          eventType: 'WalkFinished',
          payload: expect.objectContaining({ captureStatus: 'captured' }),
        }),
      );
    });
  });

  function makeExistingBooking(): Booking {
    const booking = Booking.request({
      ownerId: 'owner-1',
      providerId: 'provider-1',
      scheduledAt: new Date('2026-08-01T12:00:00Z'),
      idempotencyKey: 'idem-1',
      lines: cmd.lines,
    });
    booking.priceBreakdown = {
      bookingId: booking.id,
      rateAmount: 5000,
      commissionAmount: 500,
      taxAmount: 0,
      tipEstimate: 0,
      totalAmount: 5000,
      currency: 'USD',
      total: Money.of(5000, 'USD'),
    } as never;
    return booking;
  }
});
