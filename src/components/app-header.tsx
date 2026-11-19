import { Link } from '@tanstack/react-router'
import { Bell, LogOut, MapPin } from 'lucide-react'
import { cn } from 'cn'
import { useAdmin } from '@/features/auth/admin-provider'
import { usePendingStoreRequestCount } from '@/features/store-requests/use-store-requests'
import { GlassSurface } from '@/components/glass-surface'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function AppHeader() {
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
      <AppHeaderActions />
    </header>
  )
}

export function AppHeaderActions({ glass = false }: { glass?: boolean }) {
  const admin = useAdmin()
  const pending = usePendingStoreRequestCount()
  const actionButtonClassName = glass
    ? 'relative h-10 w-8 rounded-full transition hover:bg-foreground/10 aria-expanded:bg-foreground/10 dark:hover:bg-foreground/10 max-[360px]:w-[30px] lg:w-10'
    : 'size-10 hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent'
  const count = pending.isError ? undefined : pending.data
  const requestLabel = pending.isError
    ? '登録・修正申請一覧（件数を取得できませんでした）'
    : count === undefined
      ? '登録・修正申請一覧（件数を確認中）'
      : `登録・修正申請一覧（申請中${count}件）`

  const actions = (
    <div
      className={cn('flex shrink-0 items-center', !glass && 'ml-auto gap-2')}
    >
      <ThemeToggle className={actionButtonClassName} />
      {admin.status === 'admin' && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className={cn('relative', actionButtonClassName)}
              >
                <Link to="/admin/store-requests" aria-label={requestLabel}>
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
            </TooltipTrigger>
            <TooltipContent side="bottom">通知</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className={actionButtonClassName}
                  aria-label="ログアウト"
                  disabled={admin.busy}
                  onClick={() => void admin.logout()}
                >
                  <LogOut className="size-5" aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">ログアウト</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  )

  return (
    <TooltipProvider delayDuration={300}>
      {glass ? <GlassSurface>{actions}</GlassSurface> : actions}
    </TooltipProvider>
  )
}
