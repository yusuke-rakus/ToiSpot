import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { firebaseEnabled } from '@/lib/firebase'
import {
  loginErrorMessage,
  loginWithPassword,
  logoutAdmin,
  observeAdminSession,
  type AdminSession,
} from './auth-repository'

type AdminContextValue = AdminSession & {
  enabled: boolean
  busy: boolean
  login: (email: string, password: string) => Promise<void>
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
    status: firebaseEnabled ? 'loading' : 'signedOut',
    message: null,
  })
  const [busy, setBusy] = useState(false)
  const operationPending = useRef(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => observeAdminSession(setSession), [revision])
  async function login(email: string, password: string) {
    if (operationPending.current || !firebaseEnabled) return
    operationPending.current = true
    // セッション準備・監視に失敗した後の再ログインでは購読も再開する。
    if (session.status === 'error') setRevision((value) => value + 1)
    setBusy(true)
    setSession({ status: 'loading', message: null })
    try {
      await loginWithPassword(email, password)
    } catch (error) {
      setSession({ status: 'signedOut', message: loginErrorMessage(error) })
    } finally {
      operationPending.current = false
      setBusy(false)
    }
  }
  async function logout() {
    if (operationPending.current || !firebaseEnabled) return
    operationPending.current = true
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
      operationPending.current = false
      setBusy(false)
    }
  }
  return (
    <AdminContext.Provider
      value={{
        ...session,
        enabled: firebaseEnabled,
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
