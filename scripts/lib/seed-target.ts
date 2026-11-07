export function getSeedTarget(env: Record<string, string | undefined>) {
  const projectId = 'demo-toilet-map'
  const host = env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:18081'
  const authHost = env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:19090'
  if (!['127.0.0.1:19090', 'localhost:19090'].includes(authHost))
    throw new Error(
      'シードの接続先はローカルAuth Emulatorの19090番に限定しています。',
    )
  if (!['127.0.0.1:18081', 'localhost:18081'].includes(host)) {
    throw new Error(
      'シードの接続先はローカルFirestore Emulatorの18081番に限定しています。',
    )
  }
  for (const name of [
    'GCLOUD_PROJECT',
    'GOOGLE_CLOUD_PROJECT',
    'FIREBASE_PROJECT_ID',
  ]) {
    if (env[name] && env[name] !== projectId)
      throw new Error('シードのプロジェクトはdemo-toilet-mapに限定しています。')
  }
  return { projectId, host, authHost }
}
