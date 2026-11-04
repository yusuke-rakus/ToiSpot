import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { usesFirebaseEmulators } from '@/lib/firebase'
import {
  loginErrorMessage,
  loginWithGoogle,
  logoutAdmin,
  observeAdminSession,
  type AdminSession,
} from './auth-repository'

type AdminContextValue = AdminSession & {
  enabled: boolean
  busy: boolean
  login: () => Promise<void>
  logout: () => Promise<void>
  refreshAccess: () => void
}
const AdminContext = createContext<AdminContextValue>({
  status: 'signedOut',
  message: null,
  enabled: false,
  busy: false,
  login: async () => {},
  logout: async () => {},
  refreshAccess: () => {},
})

export function AdminProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession>({
    status: usesFirebaseEmulators ? 'loading' : 'signedOut',
    message: null,
  })
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => observeAdminSession(setSession), [revision])
  async function login() {
    if (busy || !usesFirebaseEmulators) return
    setBusy(true)
    setSession({ status: 'loading', message: null })
    try {
      await loginWithGoogle()
    } catch (error) {
      setSession({ status: 'signedOut', message: loginErrorMessage(error) })
    } finally {
      setBusy(false)
    }
  }
  async function logout() {
    if (busy || !usesFirebaseEmulators) return
    setBusy(true)
    // サインアウト完了待ちの間にも書き込み操作を提供しない。
    setSession({ status: 'loading', message: null })
    try {
      await logoutAdmin()
    } catch {
      setSession({
        status: 'error',
        message: 'ログアウトに失敗しました。もう一度お試しください。',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <AdminContext.Provider
      value={{
        ...session,
        enabled: usesFirebaseEmulators,
        busy,
        login,
        logout,
        refreshAccess: () => {
          setSession({ status: 'loading', message: null })
          setRevision((value) => value + 1)
        },
      }}
    >
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  return useContext(AdminContext)
}
