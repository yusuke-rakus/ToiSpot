import { z } from 'zod'

const firebaseConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  authDomain: z.string().trim().min(1),
  projectId: z
    .string()
    .trim()
    .min(1)
    .refine((id) => !id.startsWith('demo-')),
  appId: z.string().trim().min(1),
})

export type FirebaseConnection =
  | {
      mode: 'emulator' | 'cloud'
      enabled: true
      projectId: string
      config: z.infer<typeof firebaseConfigSchema>
      error: null
    }
  | {
      mode: 'disabled'
      enabled: false
      projectId: null
      config: null
      error: string | null
    }

export function resolveFirebaseConnection(
  env: Record<string, unknown>,
): FirebaseConnection {
  if (env.MODE === 'e2e')
    return {
      mode: 'disabled',
      enabled: false,
      projectId: null,
      config: null,
      error: null,
    }

  const flag =
    typeof env.VITE_USE_FIREBASE_EMULATORS === 'string'
      ? env.VITE_USE_FIREBASE_EMULATORS.trim()
      : env.VITE_USE_FIREBASE_EMULATORS
  if (flag === undefined || flag === 'true') {
    const config = {
      apiKey: 'demo-api-key',
      authDomain: 'demo-toilet-map.firebaseapp.com',
      projectId: 'demo-toilet-map',
      appId: 'demo-app-id',
    }
    return {
      mode: 'emulator',
      enabled: true,
      projectId: config.projectId,
      config,
      error: null,
    }
  }

  if (flag !== 'false')
    return {
      mode: 'disabled',
      enabled: false,
      projectId: null,
      config: null,
      error:
        'Firebaseの接続設定を確認してください。VITE_USE_FIREBASE_EMULATORSはtrueまたはfalseで指定します。',
    }

  const parsed = firebaseConfigSchema.safeParse({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  if (!parsed.success)
    return {
      mode: 'disabled',
      enabled: false,
      projectId: null,
      config: null,
      error:
        'Firebaseの接続設定が不完全です。管理者がFirebase設定4項目と実プロジェクトIDを確認してください。',
    }
  return {
    mode: 'cloud',
    enabled: true,
    projectId: parsed.data.projectId,
    config: parsed.data,
    error: null,
  }
}

// エラーには設定値を含めない。ブラウザと同じ判定で公開用ビルドを検査する。
export function validateProductionConfig(env: Record<string, unknown>) {
  const connection = resolveFirebaseConnection(env)
  if (connection.mode !== 'cloud')
    throw new Error(
      '本番ビルドにはVITE_USE_FIREBASE_EMULATORS=falseとFirebase設定4項目（実プロジェクトID）が必要です。',
    )
  for (const key of ['VITE_GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_MAP_ID']) {
    if (typeof env[key] !== 'string' || !env[key].trim())
      throw new Error(`本番ビルドには${key}が必要です。`)
  }
  if ((env.VITE_GOOGLE_MAPS_MAP_ID as string).trim() === 'DEMO_MAP_ID')
    throw new Error('本番ビルドにはDEMO_MAP_ID以外のMap IDが必要です。')
}
