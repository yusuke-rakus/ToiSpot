import { Link } from '@tanstack/react-router'
import { Bell, MapPin } from 'lucide-react'
import { useAdmin } from '@/features/auth/admin-provider'
import { usePendingStoreRequestCount } from '@/features/store-requests/use-store-requests'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

export function AppHeader() {
  const admin = useAdmin()
  const pending = usePendingStoreRequestCount()
  const count = pending.isError ? undefined : pending.data
  const requestLabel = pending.isError
    ? '登録・修正申請一覧（件数を取得できませんでした）'
    : count === undefined
      ? '登録・修正申請一覧（件数を確認中）'
      : `登録・修正申請一覧（申請中${count}件）`

  return (
    <header className="z-10 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b bg-background px-4 py-1.5 sm:min-h-16 sm:px-7 sm:py-2">
      <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <MapPin className="size-5" aria-hidden="true" />
        </div>
        <h1 className="text-sm font-semibold tracking-tight sm:text-base">
          コンビニトイレマップ
        </h1>
      </Link>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <ThemeToggle />
        {admin.status === 'admin' && (
          <>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="relative size-10"
            >
              <Link
                to="/admin/store-requests"
                aria-label={requestLabel}
                title={requestLabel}
              >
                <Bell className="size-5" aria-hidden="true" />
                {count !== undefined && count > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 right-0 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums"
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>
            </Button>
            <span className="hidden text-xs text-primary sm:inline">
              管理者
            </span>
            <Button
              variant="outline"
              disabled={admin.busy}
              onClick={() => void admin.logout()}
            >
              ログアウト
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
