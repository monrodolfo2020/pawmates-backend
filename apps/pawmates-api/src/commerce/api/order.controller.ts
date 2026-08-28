import {
  CurrentAccount,
  IdempotencyInterceptor,
  JwtAuthGuard,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { Order } from '../domain/entities/order.entity';
import { CommerceProcessManager } from '../domain/saga/commerce-process-manager';
import { PlaceOrderDto } from './dto/place-order.dto';

/** Mirrors booking-svc's BookingController shape for the Order lifecycle. */
@Controller('v1/orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(
    private readonly processManager: CommerceProcessManager,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  async place(
    @Body() dto: PlaceOrderDto,
    @CurrentAccount() account: AuthenticatedAccount,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const order = await this.processManager.placeOrder(
      {
        ownerId: account.accountId,
        storefrontId: dto.storefrontId,
        paymentMethodId: dto.paymentMethodId,
        idempotencyKey,
        lines: dto.lines,
      },
      traceId ?? ulid().toLowerCase(),
    );
    return { data: toOrderResponse(order) };
  }

  @Get()
  async list(
    @CurrentAccount() account: AuthenticatedAccount,
    @Query('status') status?: string,
    @Query('limit') limit = '20',
  ) {
    const qb = this.orders
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.lines', 'l')
      .where(
        account.activeContext === 'owner'
          ? 'o.owner_id = :accountId'
          : 'o.provider_id = :accountId',
        { accountId: account.accountId },
      )
      .orderBy('o.createdAt', 'DESC')
      .take(Math.min(Number(limit) || 20, 100));

    if (status) qb.andWhere('o.status = :status', { status });

    const rows = await qb.getMany();
    return { data: rows.map(toOrderResponse) };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const order = await this.orders.findOneOrFail({
      where: { id },
      relations: ['lines'],
    });
    return { data: toOrderResponse(order) };
  }

  /** Owner retries linking a delivery Booking after booking a walk post-purchase. */
  @Post(':id/attach-delivery-booking')
  async attachDeliveryBooking(
    @Param('id') id: string,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const order = await this.processManager.attachDeliveryBooking(
      id,
      traceId ?? ulid().toLowerCase(),
    );
    return { data: toOrderResponse(order) };
  }

  @Post(':id/confirm-delivery')
  async confirmDelivery(
    @Param('id') id: string,
    @CurrentAccount() account: AuthenticatedAccount,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const order = await this.processManager.confirmDelivery(
      id,
      account.accountId,
      traceId ?? ulid().toLowerCase(),
    );
    return { data: toOrderResponse(order) };
  }

  @Post(':id/cancel')
  @UseInterceptors(IdempotencyInterceptor)
  async cancel(
    @Param('id') id: string,
    @CurrentAccount() account: AuthenticatedAccount,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const order = await this.processManager.cancelOrder(
      id,
      account.accountId,
      traceId ?? ulid().toLowerCase(),
    );
    return { data: toOrderResponse(order) };
  }
}

function toOrderResponse(order: Order) {
  return {
    id: order.id,
    ownerId: order.ownerId,
    storefrontId: order.storefrontId,
    providerId: order.providerId,
    status: order.status,
    deliveryBookingId: order.deliveryBookingId,
    deliveryWindowOpenAt: order.deliveryWindowOpenAt,
    total: { amount: order.totalAmount, currency: order.totalCurrency },
    lines: order.lines?.map((l) => ({
      productId: l.productId,
      name: l.nameSnapshot,
      unitPrice: { amount: l.unitPriceAmount, currency: l.unitPriceCurrency },
      quantity: l.quantity,
      lineTotal: l.lineTotalAmount,
    })),
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    deliveredAt: order.deliveredAt,
    refundedAt: order.refundedAt,
  };
}
