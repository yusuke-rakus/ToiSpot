import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { MapPage } from '@/features/map/map-page'
import { AdminLoginPage } from '@/features/auth/admin-login-page'
import { StoreRequestsPage } from '@/features/store-requests/store-requests-page'
import { Toaster } from '@/components/ui/toaster'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-xl space-y-4 px-6 py-24">
      <h1 className="text-2xl font-semibold">ページが見つかりません</h1>
      <Button asChild variant="outline">
        <Link to="/">トップに戻る</Link>
      </Button>
    </main>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: MapPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin-login',
  component: AdminLoginPage,
})

const storeRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/store-requests',
  component: StoreRequestsPage,
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    loginRoute,
    storeRequestsRoute,
  ]),
  defaultPreload: false,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
