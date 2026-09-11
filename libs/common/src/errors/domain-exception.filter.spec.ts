import { ArgumentsHost } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { DomainExceptionFilter } from './domain-exception.filter';
import { ValidationError } from './domain-error';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { headers: {} };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('DomainExceptionFilter', () => {
  it('maps a DomainError to its own status/code without touching the DataSource', () => {
    const dataSource = { destroy: jest.fn(), initialize: jest.fn() } as unknown as DataSource;
    const filter = new DomainExceptionFilter(dataSource);
    const { host, status, json } = makeHost();

    filter.catch(new ValidationError('bad input'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'validation.invalid_field' }) }),
    );
    expect(dataSource.destroy).not.toHaveBeenCalled();
  });

  it('reconnects the DataSource when a stale Turso/Hrana stream is detected', async () => {
    const initialize = jest.fn().mockResolvedValue(undefined);
    const destroy = jest.fn().mockResolvedValue(undefined);
    const dataSource = { destroy, initialize } as unknown as DataSource;
    const filter = new DomainExceptionFilter(dataSource);
    const { host, status } = makeHost();

    filter.catch(
      new Error('Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: abc\\"}"))'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    // healConnection() is deliberately fire-and-forget — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    expect(destroy).toHaveBeenCalled();
    expect(initialize).toHaveBeenCalled();
  });

  it('does not touch the DataSource for an unrelated internal error', async () => {
    const dataSource = { destroy: jest.fn(), initialize: jest.fn() } as unknown as DataSource;
    const filter = new DomainExceptionFilter(dataSource);
    const { host, status } = makeHost();

    filter.catch(new Error('some other failure'), host);

    expect(status).toHaveBeenCalledWith(500);
    await Promise.resolve();
    expect(dataSource.destroy).not.toHaveBeenCalled();
  });

  it('is a no-op without a DataSource (e.g. constructed with none)', () => {
    const filter = new DomainExceptionFilter();
    const { host, status } = makeHost();

    expect(() =>
      filter.catch(new Error('stream not found: xyz'), host),
    ).not.toThrow();
    expect(status).toHaveBeenCalledWith(500);
  });
});
