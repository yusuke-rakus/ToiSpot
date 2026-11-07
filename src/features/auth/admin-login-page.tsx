import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdmin } from './admin-provider'
import { firebaseConnection } from '@/lib/firebase'

export function AdminLoginPage() {
  const admin = useAdmin()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const submitting = useRef(false)
  const disabled = !admin.enabled || admin.busy || admin.status === 'loading'
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || submitting.current) return
    submitting.current = true
    try {
      await admin.login(email.trim(), password)
    } finally {
      setPassword('')
      submitting.current = false
    }
  }
  useEffect(() => {
    if (admin.status === 'admin') void navigate({ to: '/', replace: true })
  }, [admin.status, navigate])
  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-2xl font-semibold">管理者ログイン</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        事前登録された管理者のメールアドレスとパスワードでログインしてください。
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => void submit(event)}
        aria-busy={admin.busy}
      >
        <div className="space-y-2">
          <Label htmlFor="admin-email">メールアドレス</Label>
          <Input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            disabled={disabled}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-password">パスワード</Label>
          <Input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={disabled}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button className="w-full" type="submit" disabled={disabled}>
          {admin.busy
            ? 'ログイン中'
            : admin.status === 'loading'
              ? '認証を確認中'
              : 'ログイン'}
        </Button>
      </form>
      {(admin.message || !admin.enabled) && (
        <p role="alert" className="mt-4 text-sm">
          {admin.message ??
            firebaseConnection.error ??
            'ログインはこの環境では利用できません。'}
        </p>
      )}
      <Button asChild variant="link" className="mt-4">
        <Link to="/">地図へ戻る</Link>
      </Button>
    </main>
  )
}
