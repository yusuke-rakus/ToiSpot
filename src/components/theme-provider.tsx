import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = Exclude<Theme, 'system'>
export const THEME_STORAGE_KEY = 'toilet-map-theme'
const mediaQuery = '(prefers-color-scheme: dark)'

function parseTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia?.(mediaQuery).matches ? 'dark' : 'light'
}

function subscribeSystemTheme(onChange: () => void) {
  const media = window.matchMedia?.(mediaQuery)
  media?.addEventListener('change', onChange)
  return () => media?.removeEventListener('change', onChange)
}

const ThemeContext = createContext<{
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
} | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setPreference] = useState(readTheme)
  const systemTheme = useSyncExternalStore(subscribeSystemTheme, getSystemTheme)
  const resolvedTheme = theme === 'system' ? systemTheme : theme

  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setPreference(parseTheme(event.newValue))
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function setTheme(value: Theme) {
    setPreference(value)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      // 保存できない環境でも、このタブでは選択したテーマを使う。
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
