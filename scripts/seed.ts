import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getSeedTarget } from './lib/seed-target.ts'
import {
  loadSeedEnvironment,
  parseAdminCredentials,
} from './lib/seed-environment.ts'
import { seedAdminSettings, seedAdminUser } from './lib/seed-admin.ts'
import { seedStores } from './lib/seed-stores.ts'

async function main() {
  // SDK初期化前に接続先を固定。本番へのフォールバックや認証情報の読込は不要。
  const env = loadSeedEnvironment()
  const target = getSeedTarget(env)
  const credentials = parseAdminCredentials(env)
  process.env.FIRESTORE_EMULATOR_HOST = target.host
  process.env.FIREBASE_AUTH_EMULATOR_HOST = target.authHost
  // ローカル専用処理ではGoogle Cloudのメタデータサーバーを探索しない。
  process.env.METADATA_SERVER_DETECTION = 'none'
  const health = await fetch(`http://${target.host}/`, {
    signal: AbortSignal.timeout(3000),
  })
  if (!health.ok) throw new Error('Firestore Emulator is not ready')
  if (credentials) {
    const authHealth = await fetch(`http://${target.authHost}/`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!authHealth.ok) throw new Error('Auth Emulator is not ready')
  }
  const app = initializeApp({ projectId: target.projectId }, 'local-store-seed')
  try {
    const db = getFirestore(app)
    const user = credentials
      ? await seedAdminUser(getAuth(app), credentials)
      : null
    const adminResult = await seedAdminSettings(db, user?.uid ?? null)
    const storeResult = await seedStores(db)
    console.log(
      `テスト店舗：作成${storeResult.created}件、既存${storeResult.skipped}件、競合${storeResult.conflicts}件、紐付け作成${storeResult.linksCreated}件（${target.projectId} / ${target.host}）`,
    )
    console.log(
      adminResult === 'skipped'
        ? '管理者設定：ADMIN_EMAIL・ADMIN_PASSWORD未指定のため変更なし。'
        : `管理者設定：${{ created: '作成', updated: '更新', unchanged: '変更なし' }[adminResult]}。`,
    )
  } finally {
    await deleteApp(app)
  }
}

main().catch(() => {
  console.error(
    'シードに失敗しました。Auth（19090番）・Firestore（18081番）のローカルEmulator、demo-toilet-mapの接続指定、ADMIN_EMAIL・ADMIN_PASSWORDの形式、アカウントの無効状態を確認してください。旧ADMIN_GOOGLE_EMAILはADMIN_EMAIL・ADMIN_PASSWORDへ移行してください。',
  )
  process.exitCode = 1
})
