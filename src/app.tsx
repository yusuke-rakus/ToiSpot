import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { createQueryClient } from '@/lib/query-client'
import { router } from '@/router'
import { AdminProvider } from '@/features/auth/admin-provider'
import { ThemeProvider } from '@/components/theme-provider'

const queryClient = createQueryClient()

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AdminProvider>
          <RouterProvider router={router} />
        </AdminProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
