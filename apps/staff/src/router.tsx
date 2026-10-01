import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ProtectedLayout } from './components/AppShell';
import { FloorPage } from './pages/FloorPage';
import { LoginPage } from './pages/LoginPage';
import { MenuPage } from './pages/MenuPage';
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
export const tableRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/table/$tableId',
  component: TablePage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([floorRoute, ordersRoute, menuRoute, tableRoute]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
