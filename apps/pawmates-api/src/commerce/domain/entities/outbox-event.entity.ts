import { OutboxEventBase } from '@pawmates/common';
import { Entity } from 'typeorm';

@Entity({ name: 'outbox_events', schema: 'commerce' })
export class OutboxEvent extends OutboxEventBase {}
