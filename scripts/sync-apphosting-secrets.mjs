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

function parseResponse(output, valid) {
  try {
    const response = JSON.parse(output)
    if (valid(response)) return response
  } catch {
    // JSON parser errors can contain the response, including secret data.
  }
  throw new Error('Invalid Secret Manager response; sync stopped.')
}

function decodePayload(response) {
  const data = response?.payload?.data
  if (
    typeof data !== 'string' ||
    !/^[A-Za-z0-9+/_-]*={0,2}$/.test(data) ||
    (data.includes('=') && data.length % 4 !== 0)
  )
    return null
  const bytes = Buffer.from(data, 'base64')
  const normalized = data
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/=+$/, '')
  return bytes.toString('base64').replace(/=+$/, '') === normalized
    ? bytes
    : null
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
  const invoke = (command, args, input) => {
    try {
      return execute(command, args, input)
    } catch {
      // Never propagate CLI output or errors containing secret values.
      throw new Error(
        `${command} ${args[0]} failed; check deployment IAM and API configuration.`,
      )
    }
  }
  const existing = new Set(
    parseResponse(
      invoke('gcloud', [
        'secrets',
        'list',
        '--format=json(name)',
        ...projectArgs,
      ]),
      (items) =>
        Array.isArray(items) &&
        items.every(
          (item) =>
            typeof item?.name === 'string' &&
            /^projects\/[^/]+\/secrets\/[A-Za-z0-9_-]+$/.test(item.name),
        ),
    ).map((item) => item.name.split('/').pop()),
  )

  // Finish every read before creating secrets or adding any versions.
  const changed = secretNames.filter((name) => {
    if (!existing.has(name)) return true
    const versions = parseResponse(
      invoke('gcloud', [
        'secrets',
        'versions',
        'list',
        `--secret=${name}`,
        '--format=json(name,state)',
        ...projectArgs,
      ]),
      (items) =>
        Array.isArray(items) &&
        items.every(
          (item) =>
            typeof item?.name === 'string' &&
            new RegExp(
              `^projects/[^/]+/secrets/${name}/versions/[1-9][0-9]*$`,
            ).test(item.name) &&
            ['ENABLED', 'DISABLED', 'DESTROYED'].includes(item.state),
        ),
    )
    if (versions.length === 0) return true
    const latest = versions.reduce((newest, item) =>
      BigInt(item.name.split('/').pop()) > BigInt(newest.name.split('/').pop())
        ? item
        : newest,
    )
    if (latest.state !== 'ENABLED')
      throw new Error(
        `Latest version for ${name} is not enabled; sync stopped.`,
      )
    const response = parseResponse(
      invoke('gcloud', [
        'secrets',
        'versions',
        'access',
        latest.name.split('/').pop(),
        `--secret=${name}`,
        '--format=json',
        ...projectArgs,
      ]),
      (item) => item?.name === latest.name && decodePayload(item) !== null,
    )
    return !decodePayload(response).equals(Buffer.from(env[name], 'utf8'))
  })

  for (const name of changed) {
    if (!existing.has(name)) {
      invoke('gcloud', [
        'secrets',
        'create',
        name,
        '--replication-policy=automatic',
        ...projectArgs,
      ])
    }
    // Send values through stdin, never command arguments or plaintext files.
    invoke(
      'gcloud',
      ['secrets', 'versions', 'add', name, '--data-file=-', ...projectArgs],
      env[name],
    )
  }
  invoke('pnpm', [
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
  return { added: changed.length, skipped: secretNames.length - changed.length }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { added, skipped } = syncAppHostingSecrets()
    console.log(
      `App Hosting secrets synced: ${added} added, ${skipped} skipped.`,
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
