import { isIP } from 'node:net';
import type { Request } from 'express';

/** Host nginx overwrites X-Real-IP, and the API port is bound to loopback.
 * Accept that header only from a local/Docker proxy connection, never from
 * a direct public peer. It is display metadata, not an authorization signal.
 */
export function sessionIp(req: Request): string | undefined {
  const peer = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  const localProxy = peer === '::1' || peer.startsWith('127.') || peer.startsWith('10.')
    || peer.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(peer);
  const forwarded = req.headers['x-real-ip'];
  if (localProxy && typeof forwarded === 'string' && isIP(forwarded)) return forwarded;
  return isIP(peer) ? peer : undefined;
}
