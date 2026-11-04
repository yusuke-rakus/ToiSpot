import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getSeedTarget } from './lib/seed-target.ts'
import { loadSeedEnvironment } from './lib/seed-environment.ts'
import { cleanupLegacyStores } from './lib/cleanup-stores.ts'

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--apply')) throw new Error('Unknown argument')
  const target = getSeedTarget(loadSeedEnvironment())
  process.env.FIRESTORE_EMULATOR_HOST = target.host
  process.env.METADATA_SERVER_DETECTION = 'none'
  const health = await fetch(`http://${target.host}/`, {
    signal: AbortSignal.timeout(3000),
  })
  if (!health.ok) throw new Error('Firestore Emulator is not ready')
  const app = initializeApp(
    { projectId: target.projectId },
    'local-store-cleanup',
  )
  try {
    const apply = args.includes('--apply')
    const result = await cleanupLegacyStores(getFirestore(app), apply)
    console.log(
      `${apply ? '削除完了' : '削除対象（確認のみ）'}：店舗${result.stores}件、紐付け${result.links}件（${target.projectId} / ${target.host}）`,
    )
  } finally {
    await deleteApp(app)
  }
}

main().catch(() => {
  console.error(
    '整理に失敗しました。ローカルEmulatorの18081番・demo-toilet-mapへの接続を確認してください。',
  )
  process.exitCode = 1
})
