import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Shared by HTTP and realtime authentication, including legacy access tokens. */
export async function validateSession(
  prisma: PrismaService,
  payload: { sub: string; sid?: string; iat?: number },
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true, deletedAt: true, sessionsRevokedAt: true,
      ...(payload.sid ? { authSessions: {
        where: { id: payload.sid, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      } } : {}),
    },
  });

  if (!user || user.deletedAt) {
    throw new UnauthorizedException({ code: 'ERR_UNAUTHORIZED' });
  }
  if (payload.sid ? !user.authSessions?.length
    : user.sessionsRevokedAt && (!payload.iat || payload.iat <= Math.floor(user.sessionsRevokedAt.getTime() / 1000))) {
    throw new UnauthorizedException({ code: 'ERR_SESSION_REVOKED', message: 'This session has been signed out. Please sign in again.' });
  }
}
