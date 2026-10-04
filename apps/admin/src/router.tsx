import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ProtectedLayout } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { validateAuditSearch } from './lib/auditSearch';
import { validateUsersSearch } from './lib/usersSearch';
import { validateVenuesSearch } from './lib/venuesSearch';
import { AccountPage } from './pages/AccountPage';
import { AuditPage } from './pages/AuditPage';
import { SystemPage } from './pages/SystemPage';
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

const systemRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/system',
  validateSearch: (search: Record<string, unknown>): { window?: '24h' | '7d' } => ({
    window: search.window === '24h' || search.window === '7d' ? search.window : undefined,
  }),
  component: SystemPage,
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
    systemRoute,
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
