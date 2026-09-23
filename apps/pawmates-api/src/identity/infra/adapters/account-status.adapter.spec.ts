import type { Repository } from 'typeorm';
import type { Account } from '../../domain/entities/account.entity';
import { AccountStatusAdapter } from './account-status.adapter';

const repoReturning = (row: Partial<Account> | null) => {
  const findOne = jest.fn().mockResolvedValue(row);
  return { repo: { findOne } as unknown as Repository<Account>, findOne };
};

describe('AccountStatusAdapter', () => {
  it('treats an account with no suspension date as active', async () => {
    const { repo } = repoReturning({ id: 'a', disabledAt: null });
    await expect(new AccountStatusAdapter(repo).standing('a')).resolves.toMatchObject({ active: true });
  });

  it('treats a suspended account as inactive', async () => {
    const { repo } = repoReturning({ id: 'a', disabledAt: new Date() });
    await expect(new AccountStatusAdapter(repo).standing('a')).resolves.toMatchObject({ active: false });
  });

  it('treats a deleted account as inactive, so its token stops working too', async () => {
    const { repo } = repoReturning(null);
    await expect(new AccountStatusAdapter(repo).standing('gone')).resolves.toEqual({ active: false, roles: [] });
  });

  it('reports the roles the account has now', async () => {
    const { repo } = repoReturning({ id: 'a', disabledAt: null, roles: ['owner', 'provider'] });
    await expect(new AccountStatusAdapter(repo).standing('a')).resolves.toEqual({
      active: true,
      roles: ['owner', 'provider'],
    });
  });

  it('answers a burst of requests from one query', async () => {
    const { repo, findOne } = repoReturning({ id: 'a', disabledAt: null });
    const adapter = new AccountStatusAdapter(repo);
    await adapter.standing('a');
    await adapter.standing('a');
    await adapter.standing('a');
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('asks again right away once told the account changed', async () => {
    const { repo, findOne } = repoReturning({ id: 'a', disabledAt: null });
    const adapter = new AccountStatusAdapter(repo);
    await adapter.standing('a');
    adapter.forget('a');
    await adapter.standing('a');
    expect(findOne).toHaveBeenCalledTimes(2);
  });
});
