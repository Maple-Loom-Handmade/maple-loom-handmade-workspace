'use client';

import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { API_ROUTES } from '@ezihubb/constants';
import { api } from '../../lib/api-client';

export function AdminSessionMonitor() {
  const { data: session } = useSession();
  const accessToken = (session?.user as Record<string, unknown> | undefined)?.['accessToken'];
  const userId = (session?.user as Record<string, unknown> | undefined)?.['id'];
  useQuery({
    queryKey: ['admin-session-device', userId],
    queryFn: async () => {
      await api.post(API_ROUTES.AUTH.SESSION_CURRENT);
      return true;
    },
    enabled: Boolean(accessToken),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  return null;
}
