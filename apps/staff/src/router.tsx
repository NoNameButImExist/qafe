import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ProtectedBare, ProtectedLayout } from './components/AppShell';
import { KdsPage } from './pages/KdsPage';
import { FloorPage } from './pages/FloorPage';
import { LoginPage } from './pages/LoginPage';
import { MenuPage } from './pages/MenuPage';
import { MyDayPage } from './pages/MyDayPage';
import { OrdersPage } from './pages/OrdersPage';
import { TablePage } from './pages/TablePage';

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

const floorRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: FloorPage });
const ordersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/orders',
  validateSearch: (search: Record<string, unknown>): { filter?: 'new' | 'active' } => ({
    filter: search.filter === 'new' || search.filter === 'active' ? search.filter : undefined,
  }),
  component: OrdersPage,
});
const menuRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/menu',
  component: MenuPage,
});
const myDayRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/me',
  component: MyDayPage,
});
export const tableRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/table/$tableId',
  component: TablePage,
});

/** Full screen without navigation, for the bar or kitchen screen. */
const bareRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'bare',
  component: ProtectedBare,
});
const kdsRoute = createRoute({ getParentRoute: () => bareRoute, path: '/kds', component: KdsPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  bareRoute.addChildren([kdsRoute]),
  appRoute.addChildren([floorRoute, ordersRoute, menuRoute, myDayRoute, tableRoute]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
