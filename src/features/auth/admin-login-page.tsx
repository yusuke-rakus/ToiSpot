import { useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useAdmin } from './admin-provider'

export function AdminLoginPage() {
  const admin = useAdmin()
  const navigate = useNavigate()
  useEffect(() => {
    if (admin.status === 'admin') void navigate({ to: '/', replace: true })
  }, [admin.status, navigate])
  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-2xl font-semibold">管理者ログイン</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        管理者のGoogleアカウントでログインしてください。現在はローカルの模擬Google認証を使用します。
      </p>
      <Button
        className="mt-6 w-full"
        disabled={!admin.enabled || admin.busy || admin.status === 'loading'}
        onClick={() => void admin.login()}
      >
        {admin.status === 'loading' ? '認証を確認中' : 'Googleでログイン'}
      </Button>
      {!admin.enabled && (
        <p className="mt-4 text-sm">
          ログインはローカルEmulator接続時に利用できます。
        </p>
      )}
      <Button asChild variant="link" className="mt-4">
        <Link to="/">地図へ戻る</Link>
      </Button>
    </main>
  )
}
