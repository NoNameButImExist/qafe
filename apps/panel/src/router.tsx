import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ProtectedBare, ProtectedLayout } from './components/AppShell';
import i18n from './i18n';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { LoginPage } from './pages/LoginPage';
import { MenuPage } from './pages/MenuPage';
import { OverviewPage } from './pages/OverviewPage';
import { QrPrintPage } from './pages/QrPrintPage';
import { StaffPage } from './pages/StaffPage';
import { TablesPage } from './pages/TablesPage';
import { SettingsPage } from './pages/SettingsPage';

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

const page = (
  path: '/' | '/menu' | '/settings' | '/tables' | '/staff',
  component: () => React.ReactNode,
) => createRoute({ getParentRoute: () => appRoute, path, component });

/** Sections planned by the requirements; placeholders until they are built. */
const soon = (
  path: '/tables' | '/staff' | '/orders' | '/reports',
  titleKey: `nav.${string}`,
  refs: string,
) =>
  createRoute({
    getParentRoute: () => appRoute,
    path,
    component: () => <ComingSoonPage title={i18n.t(titleKey as 'nav.tables')} refs={refs} />,
  });

/** Signed-in pages without the app chrome (print layouts). */
const printRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'print',
  component: ProtectedBare,
});

const qrPrintRoute = createRoute({
  getParentRoute: () => printRoute,
  path: '/tables/print',
  validateSearch: (search: Record<string, unknown>): { ids?: string } => ({
    ids: typeof search.ids === 'string' && search.ids ? search.ids : undefined,
  }),
  component: QrPrintPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  printRoute.addChildren([qrPrintRoute]),
  appRoute.addChildren([
    page('/', OverviewPage),
    page('/menu', MenuPage),
    page('/settings', SettingsPage),
    page('/tables', TablesPage),
    page('/staff', StaffPage),
    soon('/orders', 'nav.orders', 'FR-SEF-23'),
    soon('/reports', 'nav.reports', 'FR-SEF-24, FR-SEF-25'),
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
