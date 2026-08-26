export interface CreateBookingLineCommand {
  petId: string;
  serviceTypeCode: string;
  durationValue: number;
  durationUnit: 'min' | 'hour' | 'day';
  addressId: string;
}

export interface CreateBookingCommand {
  ownerId: string;
  providerServiceId: string;
  scheduledAt: Date;
  idempotencyKey: string;
  lines: CreateBookingLineCommand[];
  recurrenceSeriesId?: string;
}

export interface CreateRecurringBookingCommand {
  ownerId: string;
  providerServiceId: string;
  lines: CreateBookingLineCommand[];
  rule: import('../value-objects/recurrence-rule').RecurrenceRule;
  idempotencyKeyPrefix: string;
}
