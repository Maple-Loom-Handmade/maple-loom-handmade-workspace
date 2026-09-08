import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import axios, { AxiosError } from 'axios';
import { API_ROUTES } from '@ezihubb/constants';
// Note: cannot import api-client.ts here — it imports authOptions (circular).
// Use axios directly for the two unauthenticated login calls.

// ── NEXTAUTH_URL auto-detection ───────────────────────────────────────────────
// NextAuth v4 REQUIRES NEXTAUTH_URL in production to build callback/redirect URLs.
// Preferred: set NEXTAUTH_URL explicitly in the server's environment variables.

if (!process.env['NEXTAUTH_URL']) {
  const detected =
    // NEXT_PUBLIC_NEXTAUTH_URL is set by the user as a full URL (with https://) —
    // use it as-is; baked into the bundle at build time via NEXT_PUBLIC_* args.
    process.env['NEXT_PUBLIC_NEXTAUTH_URL'] ??
    // ADMIN_URL — explicit user-set environment variable (recommended in production).
    process.env['ADMIN_URL'];

  if (detected) {
    process.env['NEXTAUTH_URL'] = detected;
  } else if (process.env['NODE_ENV'] === 'production') {
    console.error(
      '[Admin auth] NEXTAUTH_URL is not set and could not be auto-detected. ' +
        'Set NEXTAUTH_URL=https://<your-admin-domain> in the server environment.',
    );
  }
}

// ── API base URL ──────────────────────────────────────────────────────────────
// Build the full /api/v1 URL regardless of whether the env var already has the
// path suffix.  Mirrors the normalisation in libs/shared/api-client/src/client.ts.

function buildApiBase(): string {
  const raw =
    process.env['API_URL'] ?? // preferred: server-only var
    process.env['NEXT_PUBLIC_API_URL'] ?? // fallback: build-time public var
    'http://localhost:3002';

  // Strip any trailing /api/v1 then re-add — makes both forms equivalent.
  return raw.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '') + '/api/v1';
}

const API_BASE = buildApiBase();

// ── Auth options ──────────────────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        partialToken: { label: 'Partial Token', type: 'text' },
        totpCode: { label: 'TOTP Code', type: 'text' },
      },

      async authorize(credentials, req) {
        const browserHeaders = { 'User-Agent': String(req.headers?.['user-agent'] ?? '') };
        // ── STEP 2: TOTP code verification ──────────────────────────────────
        if (credentials?.partialToken && credentials?.totpCode) {
          try {
            const { data: envelope } = await axios.post<{
              data: Record<string, unknown>;
            }>(`${API_BASE}${API_ROUTES.AUTH.TOTP_VERIFY}`, {
              partialToken: credentials.partialToken,
              code: credentials.totpCode,
            }, { headers: browserHeaders });
            const data = envelope.data;
            const user = (data['user'] ?? data) as Record<string, unknown>;
            if (!['ADMIN', 'SUPER_ADMIN'].includes(user['role'] as string))
              return null;
            return {
              id: String(user['id']),
              email: String(user['email']),
              name:
                `${(user['firstName'] as string) ?? ''} ${(user['lastName'] as string) ?? ''}`.trim() ||
                String(user['email']),
              role:        user['role'] as string,
              storeId:     (user['storeId'] as string | null) ?? null,
              isSeller:    Boolean(user['isSeller']),
              permissions: user['permissions'] ?? null,
              accessToken: data['accessToken'] as string,
            };
          } catch (err) {
            if (process.env['NODE_ENV'] !== 'production') {
              console.error(
                '[Admin auth] TOTP verify failed:',
                (err as AxiosError).message,
              );
            }
            return null;
          }
        }

        // ── STEP 1: Password check ───────────────────────────────────────────
        if (!credentials?.email || !credentials?.password) return null;

        try {
          // The login endpoint uses @Res() (non-passthrough) but manually wraps:
          // res.json({ success: true, data: { accessToken, user }, meta: null })
          const { data: body, status } = await axios.post<
            Record<string, unknown>
          >(
            `${API_BASE}${API_ROUTES.AUTH.LOGIN}`,
            { email: credentials.email, password: credentials.password },
            { validateStatus: (s) => s < 500, headers: browserHeaders },
          );

          // Unwrap the { success, data, meta } envelope
          const result = (body?.['data'] ?? body) as Record<string, unknown>;

          // TOTP required (202)
          if (status === 202) {
            return {
              id: 'totp-pending',
              email: credentials.email,
              name: credentials.email,
              requiresTOTP: true,
              partialToken: result['partialToken'] as string,
            } as unknown as import('next-auth').User;
          }

          if (status !== 200 || !result) return null;

          const user = (result['user'] ?? result) as Record<string, unknown>;

          if (!['ADMIN', 'SUPER_ADMIN'].includes(user['role'] as string)) {
            if (process.env['NODE_ENV'] !== 'production') {
              console.warn(
                '[Admin auth] Blocked — role not permitted:',
                user['role'],
              );
            }
            return null;
          }

          return {
            id: String(user['id']),
            email: String(user['email']),
            name:
              `${(user['firstName'] as string) ?? ''} ${(user['lastName'] as string) ?? ''}`.trim() ||
              String(user['email']),
            role:        user['role'] as string,
            storeId:     (user['storeId'] as string | null) ?? null,
            isSeller:    Boolean(user['isSeller']),
            permissions: user['permissions'] ?? null,
            accessToken: result['accessToken'] as string,
          };
        } catch (err) {
          if (process.env['NODE_ENV'] !== 'production') {
            console.error(
              '[Admin auth] Network error reaching API:',
              API_BASE,
              (err as AxiosError).message,
            );
          }
          return null;
        }
      },
    }),
  ],

  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        const u = user as unknown as Record<string, unknown>;
        if (u['requiresTOTP']) {
          token['requiresTOTP'] = true;
          token['partialToken'] = u['partialToken'];
          token['accessToken'] = undefined;
          token['id'] = undefined;
          token['role'] = undefined;
          token['storeId'] = undefined;
          token['isSeller'] = undefined;
        } else {
          token['requiresTOTP'] = false;
          token['partialToken'] = undefined;
          token['id'] = u['id'];
          token['role'] = u['role'];
          token['storeId'] = u['storeId'] ?? null;
          token['isSeller'] = u['isSeller'] ?? false;
          token['permissions'] = u['permissions'] ?? null;
          token['accessToken'] = u['accessToken'];
        }
      }
      return token;
    },

    session: async ({ session, token }) => {
      const u = session.user as Record<string, unknown> | undefined;
      if (u) {
        u['requiresTOTP'] = token['requiresTOTP'];
        u['partialToken'] = token['partialToken'];
        u['id'] = token['id'];
        u['role'] = token['role'];
        u['storeId'] = token['storeId'] ?? null;
        u['isSeller'] = token['isSeller'] ?? false;
        u['permissions'] = token['permissions'] ?? null;
        u['accessToken'] = token['accessToken'];
      }
      return session;
    },
  },

  pages: { signIn: '/login', error: '/login' },
  events: {
    async signOut({ token }) {
      if (!token?.['accessToken']) return;
      try {
        await axios.post(`${API_BASE}${API_ROUTES.AUTH.LOGOUT}`, undefined, {
          headers: { Authorization: `Bearer ${token['accessToken']}` }, timeout: 5000,
        });
      } catch (error) {
        // Already revoked/expired sessions need no further action.
        if (!axios.isAxiosError(error) || error.response?.status !== 401) {
          console.error('[Admin auth] Could not revoke the API session during sign-out');
        }
      }
    },
  },
  session: { strategy: 'jwt', maxAge: 24 * 60 * 60 },

  // NextAuth fails closed when this server-only secret is absent in
  // production. Never use a NEXT_PUBLIC_* value or predictable fallback.
  secret: process.env['NEXTAUTH_SECRET'],

  // Debug mode in development only
  debug: process.env['NODE_ENV'] === 'development',
};
