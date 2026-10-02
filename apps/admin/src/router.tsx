import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ProtectedLayout } from './components/AppShell';
import i18n from './i18n';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { validateAuditSearch } from './lib/auditSearch';
import { validateUsersSearch } from './lib/usersSearch';
import { validateVenuesSearch } from './lib/venuesSearch';
import { AccountPage } from './pages/AccountPage';
import { AuditPage } from './pages/AuditPage';
import { ModulesPage } from './pages/ModulesPage';
import { UsersPage } from './pages/UsersPage';
import { VenueDetailPage } from './pages/VenueDetailPage';
import { VenuesPage } from './pages/VenuesPage';

const rootRoute = createRootRoute({ component: Outlet });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: ProtectedLayout,
});

const overviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: OverviewPage,
});

const venuesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/venues',
  validateSearch: validateVenuesSearch,
  component: VenuesPage,
});

const venueDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/venues/$venueId',
  component: VenueDetailPage,
});

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users',
  validateSearch: validateUsersSearch,
  component: UsersPage,
});

const accountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/account',
  component: AccountPage,
});

const modulesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/modules',
  component: ModulesPage,
});

const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/audit',
  validateSearch: validateAuditSearch,
  component: AuditPage,
});

/** Sections planned by the requirements; placeholders until they are built. */
const soon = (path: '/system', titleKey: `nav.${string}`, refs: string) =>
  createRoute({
    getParentRoute: () => appRoute,
    path,
    component: () => <ComingSoonPage title={i18n.t(titleKey as 'nav.system')} refs={refs} />,
  });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    accountRoute,
    overviewRoute,
    venuesRoute,
    venueDetailRoute,
    usersRoute,
    modulesRoute,
    auditRoute,
    soon('/system', 'nav.system', 'FR-ADM-17, FR-ADM-18'),
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
