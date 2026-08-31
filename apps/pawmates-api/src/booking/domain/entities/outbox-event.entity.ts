import { OutboxEventBase } from '@pawmates/common';
import { Entity } from 'typeorm';

@Entity({ name: 'booking_outbox_events' })
export class OutboxEvent extends OutboxEventBase {}
