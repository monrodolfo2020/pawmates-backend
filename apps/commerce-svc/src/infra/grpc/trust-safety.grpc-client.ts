import type { TrustSafetyServiceClient } from '@pawmates/proto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { TrustSafetyPort } from '../../domain/ports/trust-safety.port';

export const TRUST_SAFETY_GRPC_CLIENT = Symbol('TRUST_SAFETY_GRPC_CLIENT');

@Injectable()
export class TrustSafetyGrpcClient implements TrustSafetyPort, OnModuleInit {
  private service!: TrustSafetyServiceClient;

  constructor(
    @Inject(TRUST_SAFETY_GRPC_CLIENT) private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.service =
      this.client.getService<TrustSafetyServiceClient>('TrustSafetyService');
  }

  async checkVerificationValid(params: {
    accountId: string;
    requiredLevel: 'basic' | 'standard' | 'enhanced';
  }): Promise<{ valid: boolean; expiresAt: Date }> {
    const res = await firstValueFrom(
      this.service.checkVerificationValid({
        accountId: params.accountId,
        requiredLevel: params.requiredLevel,
      }),
    );
    return { valid: res.valid, expiresAt: new Date(res.expiresAt) };
  }
}
