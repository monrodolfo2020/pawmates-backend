import { AdminGuard, JwtAuthGuard } from '@pawmates/common';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanActivationCode } from '../domain/entities/plan-activation-code.entity';
import { CreatePlanCodeDto } from './dto/create-plan-code.dto';

function toResponse(c: PlanActivationCode) {
  return {
    code: c.code,
    period: c.period,
    note: c.note,
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    isSpent: c.isSpent,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
  };
}

/** Admin panel, "Códigos" tab. Issuing a VIP activation code is an admin
 * action; redeeming one belongs to the business (BillingController). */
@Controller('v1/admin/plan-codes')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPlanCodesController {
  constructor(
    @InjectRepository(PlanActivationCode)
    private readonly planCodes: Repository<PlanActivationCode>,
  ) {}

  /** The codes issued so far, newest first. */
  @Get()
  async list() {
    const rows = await this.planCodes.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return { data: rows.map(toResponse) };
  }

  /**
   * Issues a code that puts one business on VIP for a period (see
   * PlanActivationCode). This is how a business that paid by transfer
   * gets its plan without an admin having to flip a switch per customer
   * — and unlike that switch, it leaves a record of what was paid for.
   */
  @Post()
  async create(@Body() dto: CreatePlanCodeDto) {
    const code = PlanActivationCode.generate({
      period: dto.period,
      note: dto.note ?? null,
      maxUses: dto.maxUses ?? 1,
    });
    await this.planCodes.save(code);
    return { data: toResponse(code) };
  }
}
