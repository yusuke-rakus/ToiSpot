import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const secretNames = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_GOOGLE_MAPS_MAP_ID',
]

function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8' })
  // Do not include process output or input in errors: either may contain secret values.
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${args[0]} failed; check deployment IAM and API configuration.`,
    )
  return result.stdout
}

export function syncAppHostingSecrets(env = process.env, execute = run) {
  for (const name of [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_APP_HOSTING_BACKEND_ID',
    ...secretNames,
  ]) {
    if (!env[name]?.trim()) throw new Error(`${name} is required`)
  }
  if (env.FIREBASE_PROJECT_ID !== env.VITE_FIREBASE_PROJECT_ID)
    throw new Error(
      'FIREBASE_PROJECT_ID and VITE_FIREBASE_PROJECT_ID must match',
    )
  if (env.VITE_GOOGLE_MAPS_MAP_ID.trim() === 'DEMO_MAP_ID')
    throw new Error('VITE_GOOGLE_MAPS_MAP_ID must be a production Map ID')

  const projectArgs = ['--project', env.FIREBASE_PROJECT_ID, '--quiet']
  const existing = new Set(
    execute('gcloud', [
      'secrets',
      'list',
      '--format=value(name)',
      ...projectArgs,
    ])
      .trim()
      .split('\n')
      .map((name) => name.split('/').pop()),
  )
  for (const name of secretNames) {
    if (!existing.has(name)) {
      execute('gcloud', [
        'secrets',
        'create',
        name,
        '--replication-policy=automatic',
        ...projectArgs,
      ])
    }
    // Send values through stdin, never command arguments or plaintext files.
    execute(
      'gcloud',
      ['secrets', 'versions', 'add', name, '--data-file=-', ...projectArgs],
      env[name],
    )
  }
  execute('pnpm', [
    'exec',
    'firebase',
    'apphosting:secrets:grantaccess',
    secretNames.join(','),
    '--backend',
    env.FIREBASE_APP_HOSTING_BACKEND_ID,
    '--project',
    env.FIREBASE_PROJECT_ID,
    '--non-interactive',
  ])
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    syncAppHostingSecrets()
    console.log('App Hosting secrets synced (values omitted).')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
