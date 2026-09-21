import {
  CurrentAccount,
  JwtAuthGuard,
  ResourceNotFoundError,
  ValidationError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { PlanActivationCode } from '../domain/entities/plan-activation-code.entity';
import { ProviderPlanActivation } from '../domain/entities/provider-plan-activation.entity';
import { BILLING_PORT } from '../domain/ports/billing.port';
import type { BillingPort } from '../domain/ports/billing.port';
import {
  BILLING_PERIODS,
  assertBillingPeriod,
  vipPrice,
} from '../domain/value-objects/billing';
import { StartCheckoutDto } from './dto/start-checkout.dto';
import { RedeemCodeDto } from './dto/redeem-code.dto';

const APP_URL = process.env.APP_URL ?? 'https://pawmates-one.vercel.app';

/**
 * Everything about paying for VIP. The prices are public (a business has
 * to see what it costs before deciding), the rest needs the business's
 * own token.
 *
 * There is no payment gateway connected yet — see billing.port.ts. Until
 * there is, `plans.online` comes back false, checkout refuses, and VIP is
 * turned on with an activation code an admin handed over after being
 * paid some other way.
 */
@Controller('v1/billing')
export class BillingController {
  constructor(
    @InjectRepository(ProviderProfile)
    private readonly profiles: Repository<ProviderProfile>,
    @InjectRepository(ProviderPlanActivation)
    private readonly activations: Repository<ProviderPlanActivation>,
    @InjectRepository(PlanActivationCode)
    private readonly codes: Repository<PlanActivationCode>,
    @Inject(BILLING_PORT) private readonly billing: BillingPort,
  ) {}

  /** What VIP costs, and whether it can be paid in-app right now. */
  @Get('plans')
  plans() {
    return {
      data: {
        online: this.billing.online,
        provider: this.billing.name,
        periods: BILLING_PERIODS.map((period) => ({
          period,
          ...vipPrice(period),
        })),
      },
    };
  }

  /** The business's own plan, as the "Mi página" screen shows it. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async myPlan(@CurrentAccount() account: AuthenticatedAccount) {
    const profile = await this.requireProfile(account.accountId);
    const history = await this.activations.find({
      where: { accountId: account.accountId, status: 'active' },
      order: { activatedAt: 'DESC' },
      take: 10,
    });
    return {
      data: {
        plan: profile.plan,
        isVip: profile.isVip(),
        expiresAt: profile.planExpiresAt,
        online: this.billing.online,
        history: history.map((a) => ({
          id: a.id,
          period: a.period,
          source: a.source,
          amount:
            a.amountCents === null
              ? null
              : { amount: a.amountCents, currency: a.currency ?? 'MXN' },
          expiresAt: a.expiresAt,
          activatedAt: a.activatedAt,
        })),
      },
    };
  }

  /**
   * Opens a checkout with whatever gateway is configured and records it
   * as pending. Nothing about the plan changes here — only the gateway
   * confirming payment does that (see callback()), because a business
   * that abandons the payment page must not walk away with VIP.
   */
  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async checkout(
    @Body() dto: StartCheckoutDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    if (!this.billing.online) {
      throw new ValidationError(
        'Los pagos en línea todavía no están disponibles. Escríbenos para activar tu plan VIP.',
      );
    }
    assertBillingPeriod(dto.period);
    const profile = await this.requireProfile(account.accountId);
    const price = vipPrice(dto.period);

    const session = await this.billing.createCheckout({
      accountId: account.accountId,
      businessName: profile.businessName ?? 'Tu negocio',
      period: dto.period,
      amount: price.amount,
      currency: price.currency,
      returnUrl: `${APP_URL}/billing/return`,
    });

    await this.activations.save(
      ProviderPlanActivation.start({
        accountId: account.accountId,
        period: dto.period,
        source: 'checkout',
        reference: session.reference,
        amountCents: price.amount,
        currency: price.currency,
      }),
    );

    return { data: { url: session.url, reference: session.reference } };
  }

  /**
   * Where the gateway reports a completed payment. Unauthenticated on
   * purpose — the caller is the gateway, not the business — so it trusts
   * nothing but the port's own verification of the payload, and acts
   * only on a reference it already created itself.
   *
   * Idempotent: a gateway that retries (they all do) finds the
   * activation already active and changes nothing.
   */
  @Post('callback')
  async callback(
    @Body() payload: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    const reference = await this.billing.verifyCallback(payload, headers);
    if (!reference) return { data: { applied: false } };

    const activation = await this.activations.findOne({ where: { reference } });
    if (!activation) return { data: { applied: false } };
    if (activation.status === 'active') {
      return { data: { applied: true, expiresAt: activation.expiresAt } };
    }

    const profile = await this.requireProfile(activation.accountId);
    const expiresAt = profile.activateVip(activation.period);
    activation.markActive(expiresAt);
    await this.profiles.save(profile);
    await this.activations.save(activation);

    return { data: { applied: true, expiresAt } };
  }

  /**
   * Turns on VIP with a code an admin issued. This is the path that
   * actually carries the product today: the business pays by transfer or
   * in person, an admin generates a code for the period paid, and the
   * business types it in.
   */
  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  async redeem(
    @Body() dto: RedeemCodeDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const normalized = PlanActivationCode.normalize(dto.code);
    const code = await this.codes.findOne({ where: { code: normalized } });
    if (!code) {
      throw new ValidationError('Ese código no existe.');
    }
    code.redeem(); // throws if spent or expired

    const profile = await this.requireProfile(account.accountId);
    const expiresAt = profile.activateVip(code.period);

    const activation = ProviderPlanActivation.start({
      accountId: account.accountId,
      period: code.period,
      source: 'code',
      // Scoped by account so the same multi-use code redeemed by two
      // businesses doesn't collide on the unique reference index.
      reference: `code:${normalized}:${account.accountId}`,
      amountCents: null,
      currency: null,
    });
    activation.markActive(expiresAt);

    await this.profiles.save(profile);
    await this.codes.save(code);
    await this.activations.save(activation);

    return {
      data: { plan: profile.plan, isVip: profile.isVip(), expiresAt },
    };
  }

  private async requireProfile(accountId: string): Promise<ProviderProfile> {
    const profile = await this.profiles.findOne({ where: { accountId } });
    if (!profile) {
      throw new ResourceNotFoundError(
        'Todavía no has creado la página de tu negocio.',
      );
    }
    return profile;
  }
}
