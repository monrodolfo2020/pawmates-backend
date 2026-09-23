import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ACCOUNT_STATUS } from '@pawmates/common';
import { Account } from './domain/entities/account.entity';
import { AccountStatusAdapter } from './infra/adapters/account-status.adapter';

/**
 * Global because JwtAuthGuard is used by controllers in every module, and
 * each of them has to be able to resolve the status check the guard asks
 * for. Without this the guard's optional injection would quietly resolve
 * to nothing in those modules, and a suspended account would keep working
 * everywhere except the identity module — which is the kind of partial
 * enforcement that is worse than none, because it looks like it works.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Account])],
  providers: [
    AccountStatusAdapter,
    { provide: ACCOUNT_STATUS, useExisting: AccountStatusAdapter },
  ],
  exports: [ACCOUNT_STATUS, AccountStatusAdapter],
})
export class AccountStatusModule {}
