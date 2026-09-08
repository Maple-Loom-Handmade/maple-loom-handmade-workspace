import { ConfigService } from '@nestjs/config';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { sessionIp } from './session-ip';

// Session tests do not exercise TOTP; avoid loading its ESM-only crypto dependencies in Jest.
jest.mock('./totp.service', () => ({ TotpService: class {} }));
jest.mock('../messages/messages.service', () => ({ MessagesService: class {} }));

describe('Session IP metadata', () => {
  function request(peer: string, forwarded?: string) {
    return { socket: { remoteAddress: peer }, headers: { 'x-real-ip': forwarded } } as unknown as Parameters<typeof sessionIp>[0];
  }

  it('uses the IP supplied by the local reverse proxy', () => {
    expect(sessionIp(request('::ffff:172.18.0.1', '203.0.113.10'))).toBe('203.0.113.10');
  });

  it('ignores spoofed forwarding headers from public peers', () => {
    expect(sessionIp(request('203.0.113.10', '198.51.100.5'))).toBe('203.0.113.10');
  });

  it('ignores malformed forwarding headers', () => {
    expect(sessionIp(request('127.0.0.1', 'not-an-ip'))).toBe('127.0.0.1');
  });
});

function setup() {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    authSession: {
      findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 2 }), update: jest.fn(),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const service = Object.create(AuthService.prototype) as AuthService;
  Object.assign(service, { prisma });
  return { prisma, service };
}

describe('Account session history and revocation', () => {
  it('cannot revoke another account session', async () => {
    const { prisma, service } = setup();
    prisma.authSession.findFirst.mockResolvedValue(null);
    await expect(service.revokeSession('owner', 'foreign')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.authSession.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', userId: 'owner' } });
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('revokes only the selected session and its refresh tokens, preserving history', async () => {
    const { prisma, service } = setup();
    prisma.authSession.findFirst.mockResolvedValue({ id: 'session' });
    await service.revokeSession('owner', 'session');
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session', userId: 'owner', revokedAt: null }, data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'session', userId: 'owner', revokedAt: null }, data: { revokedAt: expect.any(Date) },
    });
  });

  it('logout everywhere revokes recorded sessions, refresh tokens and legacy access tokens atomically', async () => {
    const { prisma, service } = setup();
    await expect(service.logoutAll('owner')).resolves.toEqual({ revoked: 2 });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'owner' }, data: { sessionsRevokedAt: expect.any(Date) } });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({ where: { userId: 'owner', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('distinguishes current, signed-out and expired sessions and scopes pagination to the account', async () => {
    const { prisma, service } = setup();
    const active = { id: 'current', expiresAt: new Date(Date.now() + 60000), revokedAt: null };
    prisma.authSession.findMany.mockResolvedValue([
      active,
      { ...active, id: 'closed', revokedAt: new Date() },
      { ...active, id: 'expired', expiresAt: new Date(0) },
    ]);
    prisma.authSession.count.mockResolvedValue(13);
    const result = await service.listSessions('owner', 'current', 2);
    expect(result.data.map(({ status, isCurrent }) => ({ status, isCurrent }))).toEqual([
      { status: 'ACTIVE', isCurrent: true }, { status: 'SIGNED_OUT', isCurrent: false }, { status: 'EXPIRED', isCurrent: false },
    ]);
    expect(prisma.authSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner' }, skip: 10, take: 10 }));
    expect(result.totalPages).toBe(2);
  });

  it('rejects refresh for a revoked session even when a refresh token is still present', async () => {
    const { prisma, service } = setup();
    prisma.refreshToken.findFirst.mockResolvedValue({ session: { revokedAt: new Date(), expiresAt: new Date(Date.now() + 60000) } });
    await expect(service.refreshTokens('owner', 'token', {} as Parameters<AuthService['refreshTokens']>[2]))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.update).not.toHaveBeenCalled();
  });
});

describe('Access token session enforcement', () => {
  const payload = { sub: 'owner', email: 'owner@example.test', role: 'ADMIN', iat: 100, sid: 'session' };
  function strategy(user: unknown) {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const config = { get: () => 'test-only-secret' } as unknown as ConfigService;
    return new JwtStrategy(config, prisma as unknown as PrismaService);
  }

  it('rejects access from a revoked, expired, missing or foreign session', async () => {
    await expect(strategy({ id: 'owner', deletedAt: null, authSessions: [] }).validate(payload))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows a valid session', async () => {
    await expect(strategy({ id: 'owner', deletedAt: null, authSessions: [{ id: 'session' }] }).validate(payload)).resolves.toEqual(payload);
  });

  it('revokes legacy access tokens issued before logout everywhere', async () => {
    await expect(strategy({ id: 'owner', deletedAt: null, sessionsRevokedAt: new Date(101000) }).validate({ ...payload, sid: undefined }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps legacy access tokens valid until explicitly revoked', async () => {
    await expect(strategy({ id: 'owner', deletedAt: null, sessionsRevokedAt: null }).validate({ ...payload, sid: undefined })).resolves.toBeDefined();
  });
});
