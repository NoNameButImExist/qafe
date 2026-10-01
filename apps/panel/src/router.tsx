import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  type RouteComponent,
} from '@tanstack/react-router';
import { ProtectedBare, ProtectedLayout } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { MenuPage } from './pages/MenuPage';
import { OrdersPage } from './pages/OrdersPage';
import { OverviewPage } from './pages/OverviewPage';
import { QrPrintPage } from './pages/QrPrintPage';
import { ReportPrintPage } from './pages/ReportPrintPage';
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
  path: '/' | '/menu' | '/settings' | '/tables' | '/staff' | '/orders' | '/reports',
  component: RouteComponent,
) => createRoute({ getParentRoute: () => appRoute, path, component });

/** Signed-in pages without the app chrome (print layouts). */
const printRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'print',
  component: ProtectedBare,
});

const isoDate = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;

const reportPrintRoute = createRoute({
  getParentRoute: () => printRoute,
  path: '/reports/print',
  validateSearch: (search: Record<string, unknown>): { from: string; to: string } => {
    const today = new Date().toISOString().slice(0, 10);
    return { from: isoDate(search.from, today), to: isoDate(search.to, today) };
  },
  component: ReportPrintPage,
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
  printRoute.addChildren([qrPrintRoute, reportPrintRoute]),
  appRoute.addChildren([
    page('/', OverviewPage),
    page('/menu', MenuPage),
    page('/settings', SettingsPage),
    page('/tables', TablesPage),
    page('/staff', StaffPage),
    page('/orders', OrdersPage),
    // Charts (recharts) load only when the reports page opens.
    page(
      '/reports',
      lazyRouteComponent(() => import('./pages/ReportsPage'), 'ReportsPage'),
    ),
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
