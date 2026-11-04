import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getSeedTarget } from './lib/seed-target.ts'
import { loadSeedEnvironment, parseAdminEmail } from './lib/seed-environment.ts'
import { seedAdminSettings } from './lib/seed-admin.ts'
import { seedStores } from './lib/seed-stores.ts'

async function main() {
  // SDK初期化前に接続先を固定。本番へのフォールバックや認証情報の読込は不要。
  const env = loadSeedEnvironment()
  const target = getSeedTarget(env)
  const adminEmail = parseAdminEmail(env.ADMIN_GOOGLE_EMAIL)
  process.env.FIRESTORE_EMULATOR_HOST = target.host
  // ローカル専用処理ではGoogle Cloudのメタデータサーバーを探索しない。
  process.env.METADATA_SERVER_DETECTION = 'none'
  const health = await fetch(`http://${target.host}/`, {
    signal: AbortSignal.timeout(3000),
  })
  if (!health.ok) throw new Error('Firestore Emulator is not ready')
  const app = initializeApp({ projectId: target.projectId }, 'local-store-seed')
  try {
    const db = getFirestore(app)
    const storeResult = await seedStores(db)
    console.log(
      `テスト店舗：作成${storeResult.created}件、既存${storeResult.skipped}件、競合${storeResult.conflicts}件、紐付け作成${storeResult.linksCreated}件（${target.projectId} / ${target.host}）`,
    )
    const adminResult = await seedAdminSettings(db, adminEmail)
    console.log(
      adminResult === 'skipped'
        ? '管理者設定：ADMIN_GOOGLE_EMAIL未指定のため変更なし。'
        : `管理者設定：${{ created: '作成', updated: '更新', unchanged: '変更なし' }[adminResult]}。`,
    )
  } finally {
    await deleteApp(app)
  }
}

main().catch(() => {
  console.error(
    'シードに失敗しました。Emulatorの起動、ローカル18081番・demo-toilet-mapの接続指定、ADMIN_GOOGLE_EMAILの形式を確認してください。',
  )
  process.exitCode = 1
})
