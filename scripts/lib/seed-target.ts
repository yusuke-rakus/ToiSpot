export function getSeedTarget(env: Record<string, string | undefined>) {
  const projectId = 'demo-toilet-map'
  const host = env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:18081'
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
  return { projectId, host }
}
