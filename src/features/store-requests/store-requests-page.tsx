import { useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Check, ChevronDown, RefreshCw, X } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { useAdmin } from '@/features/auth/admin-provider'
import { errorCode } from '@/features/auth/auth-repository'
import {
  availabilityLabels,
  formatEquipmentCount,
  type StoreInput,
} from '@/features/stores/store-schema'
import type { StoreRequest } from './store-request-schema'
import { StoreRequestConflictError } from './store-request-repository'
import {
  usePendingStoreRequests,
  useReviewStoreRequest,
  useStoreRequestCurrent,
} from './use-store-requests'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function StoreRequestsPage() {
  const admin = useAdmin()
  const query = usePendingStoreRequests()
  const [notice, setNotice] = useState<string | null>(null)
  const requests = query.data?.pages.flatMap((page) => page.requests) ?? []
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-7 sm:px-8 sm:py-10">
        <Button asChild variant="ghost" className="-ml-2 mb-5">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            地図に戻る
          </Link>
        </Button>
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold sm:text-2xl">
              登録・修正申請
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              申請中の内容を確認し、承認または却下してください。
            </p>
          </div>
          {admin.status === 'admin' && (
            <Button
              variant="outline"
              onClick={() => {
                setNotice(null)
                void query.refresh()
              }}
              disabled={query.isFetching}
            >
              <RefreshCw aria-hidden="true" />
              申請一覧を更新
            </Button>
          )}
        </div>
        {admin.status === 'loading' ? (
          <Loading>管理者権限を確認中</Loading>
        ) : admin.status !== 'admin' ? (
          <div className="space-y-4 border-t py-7">
            <p className="text-sm">申請の確認には管理者ログインが必要です。</p>
            <Button asChild variant="outline">
              <Link to="/admin-login">管理者ログイン</Link>
            </Button>
          </div>
        ) : (
          <>
            {notice && (
              <p role="status" className="mb-5 text-sm text-primary">
                {notice}
              </p>
            )}
            {query.isError && (
              <Alert variant="destructive" className="mb-5">
                <AlertDescription>
                  申請一覧を読み込めませんでした。更新して再試行してください。
                  {requests.length > 0 && '前回取得した申請を表示しています。'}
                </AlertDescription>
              </Alert>
            )}
            {query.isPending ? (
              <Loading>申請一覧を読み込み中</Loading>
            ) : requests.length === 0 && !query.isError ? (
              <Empty role="status" className="border-t py-16">
                <EmptyDescription>
                  申請中の登録・修正はありません。
                </EmptyDescription>
              </Empty>
            ) : (
              <ol aria-label="申請中の一覧" className="divide-y border-y">
                {requests.map((request) => (
                  <li key={request.id}>
                    <RequestRow request={request} onReviewed={setNotice} />
                  </li>
                ))}
              </ol>
            )}
            {query.hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() => void query.fetchNextPage()}
                >
                  {query.isFetchingNextPage && <Spinner aria-hidden="true" />}
                  さらに読み込む
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Loading({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
    >
      <Spinner aria-hidden="true" />
      {children}
    </p>
  )
}

function RequestRow({
  request,
  onReviewed,
}: {
  request: StoreRequest
  onReviewed: (message: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const review = useReviewStoreRequest()
  return (
    <article aria-label={`${request.input.name}の申請`} className="py-1">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 py-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-expanded={expanded}
        aria-controls={`request-${request.id}`}
        disabled={review.isPending}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="min-w-0 space-y-2">
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {request.kind === 'create' ? '新規登録' : '修正'}
            </Badge>
            <time
              dateTime={request.createdAt}
              className="text-xs text-muted-foreground"
            >
              {formatDate(request.createdAt)}
            </time>
          </span>
          <span className="block text-base font-semibold break-words">
            {request.input.name}
          </span>
          <span className="block text-xs leading-6 break-words text-muted-foreground">
            {request.input.address}
          </span>
        </span>
        <ChevronDown
          className={`mt-1 size-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div id={`request-${request.id}`} className="pb-6">
          <RequestDetails
            request={request}
            review={review}
            onReviewed={onReviewed}
          />
        </div>
      )}
    </article>
  )
}

function RequestDetails({
  request,
  review,
  onReviewed,
}: {
  request: StoreRequest
  review: ReturnType<typeof useReviewStoreRequest>
  onReviewed: (message: string) => void
}) {
  const admin = useAdmin()
  const current = useStoreRequestCurrent(request)
  const [confirmation, setConfirmation] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const submitting = useRef(false)
  const hasCurrent = request.kind === 'create' || current.isSuccess
  const stale =
    request.kind === 'update' &&
    current.data !== undefined &&
    (request.baseUpdatedAt === null ||
      !request.baseUpdatedAt.isEqual(current.data.baseUpdatedAt))
  const canApprove =
    admin.status === 'admin' &&
    hasCurrent &&
    !current.isFetching &&
    !stale &&
    !review.isPending

  async function process(action: 'approve' | 'reject') {
    if (
      submitting.current ||
      admin.status !== 'admin' ||
      (action === 'approve' && !canApprove)
    )
      return
    submitting.current = true
    setMessage(null)
    try {
      await review.mutateAsync({ id: request.id, action })
      onReviewed(
        action === 'approve'
          ? '申請を承認し、店舗情報に反映しました。'
          : '申請を却下しました。',
      )
    } catch (error) {
      setConfirmation(false)
      setMessage(
        error instanceof StoreRequestConflictError
          ? error.message
          : errorCode(error) === 'permission-denied'
            ? '処理する権限を確認できません。管理者として再ログインしてください。'
            : '申請を処理できませんでした。通信状態を確認して再試行してください。',
      )
      if (errorCode(error) === 'permission-denied') admin.refreshAccess()
      if (action === 'approve' && request.kind === 'update')
        void current.refetch()
    } finally {
      submitting.current = false
    }
  }

  return (
    <div className="space-y-5">
      {request.kind === 'update' && current.isPending && (
        <Loading>現在の店舗情報を確認中</Loading>
      )}
      {request.kind === 'update' && current.isError && (
        <Alert variant="destructive">
          <AlertDescription className="space-y-3">
            <p>
              現在の店舗情報を確認できません。内容を確認するまで承認できません。
            </p>
            <Button
              variant="outline"
              disabled={current.isFetching}
              onClick={() => void current.refetch()}
            >
              店舗情報を再取得
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {stale && (
        <Alert variant="destructive">
          <AlertDescription>
            申請後に店舗情報が更新されているため承認できません。内容を確認し、この申請を却下してください。
          </AlertDescription>
        </Alert>
      )}
      <RequestComparison
        input={request.input}
        current={request.kind === 'update' ? current.data?.store : undefined}
      />
      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          variant="outline"
          disabled={review.isPending}
          onClick={() => void process('reject')}
        >
          <X aria-hidden="true" />
          却下する
        </Button>
        <Button disabled={!canApprove} onClick={() => setConfirmation(true)}>
          <Check aria-hidden="true" />
          承認する
        </Button>
      </div>
      <AlertDialog
        open={confirmation}
        onOpenChange={(open) => {
          if (!submitting.current) setConfirmation(open)
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (review.isPending) event.preventDefault()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>この申請を承認しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{request.input.name}」の申請内容を店舗情報に反映します。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={review.isPending}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!canApprove}
              onClick={(event) => {
                event.preventDefault()
                void process('approve')
              }}
            >
              {review.isPending && <Spinner aria-hidden="true" />}
              承認して反映
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function inputRows(input: StoreInput) {
  return [
    ['店名', input.name],
    ['住所', input.address],
    ['貸出状況', availabilityLabels[input.availability]],
    [
      '男性用個室',
      input.availability === 'available'
        ? formatEquipmentCount(input.stalls.male, '室')
        : '—',
    ],
    [
      '女性用個室',
      input.availability === 'available'
        ? formatEquipmentCount(input.stalls.female, '室')
        : '—',
    ],
    [
      '共用個室',
      input.availability === 'available'
        ? formatEquipmentCount(input.stalls.shared, '室')
        : '—',
    ],
    [
      '男性用小便器',
      input.availability === 'available'
        ? formatEquipmentCount(input.urinals)
        : '—',
    ],
    ['備考', input.notes.trim() || '記載なし'],
  ] as const
}

function RequestComparison({
  input,
  current,
}: {
  input: StoreInput
  current?: StoreInput
}) {
  const previous = current ? inputRows(current) : null
  return (
    <table
      aria-label="申請内容の確認"
      className="w-full table-fixed border-collapse text-left text-sm"
    >
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          <th className="w-1/4 px-2 py-3 font-medium">項目</th>
          {previous && <th className="px-2 py-3 font-medium">現在の情報</th>}
          <th className="px-2 py-3 font-medium">申請内容</th>
        </tr>
      </thead>
      <tbody>
        {inputRows(input).map(([label, value], index) => {
          const changed = previous && previous[index][1] !== value
          return (
            <tr
              key={label}
              className={changed ? 'border-b bg-primary/5' : 'border-b'}
            >
              <th
                scope="row"
                className="px-2 py-3 align-top text-xs leading-6 font-medium break-words text-muted-foreground"
              >
                {label}
              </th>
              {previous && (
                <td className="px-2 py-3 align-top leading-6 whitespace-pre-wrap break-words">
                  {previous[index][1]}
                </td>
              )}
              <td
                className={`px-2 py-3 align-top leading-6 whitespace-pre-wrap break-words ${changed ? 'font-medium text-primary' : ''}`}
              >
                {value}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
