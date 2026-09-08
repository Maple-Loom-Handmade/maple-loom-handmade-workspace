import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { authOptions } from '../../lib/auth.options';
import { AdminSidebar, AdminMobileNav } from '../../components/layout/AdminSidebar';
import { TabTitleBadge } from '../../components/layout/TabTitleBadge';
import { AdminSessionMonitor } from '../../components/providers/AdminSessionMonitor';
// import { GetHelpButton } from '../../components/layout/GetHelpButton'; // temporarily unmounted — see below
import { resolveInStoreMode, STORE_CONTEXT_COOKIE } from '../../lib/store-context-shared';
import { ServerStoreModeProvider } from '../../lib/server-store-mode';
import { getAdminRouteRedirect } from '../../lib/route-guard';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const user    = session.user as Record<string, unknown> | undefined;
  const role    = user?.['role']    as string | undefined;
  const storeId = user?.['storeId'] as string | null | undefined ?? null;

  const headersList  = await headers();
  const cookieStore   = await cookies();
  const pathname      = headersList.get('x-pathname') ?? '';
  const storeContext  = cookieStore.get(STORE_CONTEXT_COOKIE)?.value ?? null;
  // Mirrors useAdminMode()'s isPlatformContext on the client: only a
  // SUPER_ADMIN who owns a store can switch into it, and only when the
  // cookie actually matches that store. Computed regardless of role so the
  // dispatch above can be unconditional too.
  const inStoreMode       = resolveInStoreMode(storeId, storeContext);
  const isPlatformContext = !inStoreMode;

  // A backstop, not the guard. middleware.ts now makes this same call on
  // every request and redirects there, where it is an ordinary HTTP redirect
  // the browser follows — so in practice this never fires. It is kept for the
  // case the middleware matcher stops covering a path: a guard that silently
  // stops running is how a shop owner reaches a platform-only page.
  const target = getAdminRouteRedirect(pathname, role, storeId, isPlatformContext);
  if (target) redirect(target);

  return (
    // The sidebar and every client page below read the mode from here rather
    // than recomputing it from the cookie. One answer, decided where the page
    // content was decided, so the two halves cannot contradict each other.
    <ServerStoreModeProvider inStoreMode={inStoreMode}>
    <AdminSessionMonitor />
    {/* Keep the shell attached to the viewport on every route. A shared App
        Router layout survives client-side navigation, so deriving this class
        from the pathname captured on its first render left /messages in the
        old route's h-screen mode. The document could then retain/grow its own
        scroll area and move the entire inbox above the viewport. Regular pages
        already scroll in <main>, so fixing the shell is safe for them too. */}
    <div className="fixed inset-0 flex min-h-0 overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <AdminSidebar />

      {/* Right column: mobile top bar + scrollable content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AdminMobileNav />

        {/* Renders nothing — it owns the tab title, and lives here so the
            count survives navigation between admin pages the way the
            sidebar's own socket listener does. */}
        <TabTitleBadge />
        {/* h-0 supplies a definite flex basis and min-h-0 lets this item
            shrink below the inbox's min-content height. Regular pages still
            scroll on main; full-height pages can pass the remaining space to
            their own internal panes without growing the document. */}
        <a href="#admin-main-content" className="sr-only z-[10000] rounded-md bg-white px-4 py-2 text-secondary shadow focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to main content</a>
        <main id="admin-main-content" tabIndex={-1} className="flex h-0 min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3 outline-none sm:p-4 lg:p-8">
          {children}
        </main>
      </div>

      {/* Temporarily hidden across the admin: it is fixed to the bottom-right
          and sat on top of the listing editor's Publish button, which is worse
          than not having a help affordance at all. Bring it back once it can
          get out of the way of the page's own actions. */}
      {/* <GetHelpButton /> */}
    </div>
    </ServerStoreModeProvider>
  );
}
