import { Column, Entity, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';

export type MessageSenderRole = 'owner' | 'provider';

/**
 * A chat message tied to a Booking — the owner/paseador "Mensaje" thread
 * on the live-walk screen (see BookingController's messages endpoints).
 * Polled, not pushed (no WebSocket gateway in this consolidated MVP —
 * same reasoning as everything else here being request/response, see
 * README's "Consolidated MVP" section).
 */
@Entity({ name: 'booking_messages' })
export class BookingMessage {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'booking_id', type: 'text' })
  bookingId!: string;

  @Column({ name: 'sender_id', type: 'text' })
  senderId!: string;

  @Column({ name: 'sender_role', type: 'text' })
  senderRole!: MessageSenderRole;

  @Column({ type: 'text' })
  text!: string;

  @Column({ name: 'sent_at', type: 'datetime' })
  sentAt!: Date;

  static send(params: {
    bookingId: string;
    senderId: string;
    senderRole: MessageSenderRole;
    text: string;
  }): BookingMessage {
    const message = new BookingMessage();
    message.id = ulid().toLowerCase();
    message.bookingId = params.bookingId;
    message.senderId = params.senderId;
    message.senderRole = params.senderRole;
    message.text = params.text;
    message.sentAt = new Date();
    return message;
  }
}
