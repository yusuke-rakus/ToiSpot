import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { test } from 'node:test'
import {
  secretNames,
  syncAppHostingSecrets,
} from './sync-apphosting-secrets.mjs'

function fixture() {
  return {
    FIREBASE_PROJECT_ID: 'test-project',
    FIREBASE_APP_HOSTING_BACKEND_ID: 'test-backend',
    ...Object.fromEntries(
      secretNames.map((name) => [name, `test-value-${name}`]),
    ),
    VITE_FIREBASE_PROJECT_ID: 'test-project',
  }
}

function version(name, id = 15, state = 'ENABLED') {
  return { name: `projects/test-project/secrets/${name}/versions/${id}`, state }
}

function payload(name, value, id = 15) {
  return JSON.stringify({
    name: version(name, id).name,
    payload: { data: Buffer.from(value, 'utf8').toString('base64') },
  })
}

function cloud(
  env,
  { missing = [], histories = {}, values = {}, intercept } = {},
) {
  const calls = []
  const execute = (command, args, input) => {
    const call = { command, args, input }
    calls.push(call)
    const intercepted = intercept?.(call)
    if (intercepted !== undefined) return intercepted
    if (command === 'pnpm') return ''
    if (args[1] === 'list')
      return JSON.stringify(
        secretNames
          .filter((name) => !missing.includes(name))
          .map((name) => ({ name: `projects/test-project/secrets/${name}` })),
      )
    const name = args.find((arg) => arg.startsWith('--secret='))?.slice(9)
    if (args[2] === 'list')
      return JSON.stringify(histories[name] ?? [version(name)])
    if (args[2] === 'access')
      return payload(name, values[name] ?? env[name], args[3])
    assert(args[1] === 'create' || args[2] === 'add', 'unexpected command')
    return ''
  }
  return { calls, execute }
}

function writes(calls) {
  return calls.filter(
    ({ command, args }) =>
      command === 'pnpm' || args[1] === 'create' || args[2] === 'add',
  )
}

test('validates every input before cloud calls', () => {
  for (const name of ['FIREBASE_APP_HOSTING_BACKEND_ID', ...secretNames]) {
    const env = fixture()
    delete env[name]
    assert.throws(
      () => syncAppHostingSecrets(env, () => assert.fail('cloud call')),
      new RegExp(`${name} is required`),
    )
  }
  for (const [overrides, message] of [
    [{ VITE_FIREBASE_PROJECT_ID: 'wrong' }, /must match/],
    [{ VITE_GOOGLE_MAPS_MAP_ID: 'DEMO_MAP_ID' }, /production Map ID/],
  ])
    assert.throws(
      () =>
        syncAppHostingSecrets({ ...fixture(), ...overrides }, () =>
          assert.fail('cloud call'),
        ),
      message,
    )
})

test('identical settings skip all uploads and still grant backend access', () => {
  const env = fixture()
  const { calls, execute } = cloud(env)
  assert.deepEqual(syncAppHostingSecrets(env, execute), {
    added: 0,
    skipped: 6,
  })
  assert.equal(calls.filter((c) => c.args[2] === 'access').length, 6)
  assert.equal(writes(calls).length, 1)
  const grant = calls.at(-1)
  assert.equal(grant.command, 'pnpm')
  assert(grant.args.includes('apphosting:secrets:grantaccess'))
  assert(grant.args.includes(secretNames.join(',')))
  assert(grant.args.includes(env.FIREBASE_APP_HOSTING_BACKEND_ID))
})

test('one changed setting uploads once, after all reads, using only stdin', () => {
  const env = fixture()
  env.VITE_GOOGLE_MAPS_API_KEY = ' 鍵 with $() `quotes` and\nnewlines\n'
  const { calls, execute } = cloud(env, {
    values: { VITE_GOOGLE_MAPS_API_KEY: 'previous-value' },
  })
  assert.deepEqual(syncAppHostingSecrets(env, execute), {
    added: 1,
    skipped: 5,
  })
  const upload = calls.find((c) => c.args[2] === 'add')
  assert.equal(upload.input, env.VITE_GOOGLE_MAPS_API_KEY)
  assert.deepEqual(upload.args, [
    'secrets',
    'versions',
    'add',
    'VITE_GOOGLE_MAPS_API_KEY',
    '--data-file=-',
    '--project',
    env.FIREBASE_PROJECT_ID,
    '--quiet',
  ])
  const lastRead = calls.findLastIndex((c) => c.args[2] === 'access')
  assert(calls.indexOf(upload) > lastRead)
  for (const { args } of calls) assert(!args.includes(upload.input))
})

test('creates six absent secrets and their first versions', () => {
  const env = fixture()
  const { calls, execute } = cloud(env, { missing: secretNames })
  assert.deepEqual(syncAppHostingSecrets(env, execute), {
    added: 6,
    skipped: 0,
  })
  assert.equal(calls.filter((c) => c.args[1] === 'create').length, 6)
  assert.equal(calls.filter((c) => c.args[2] === 'add').length, 6)
  assert.equal(calls.filter((c) => c.args[2] === 'access').length, 0)
})

test('adds first history entry without recreating an existing secret', () => {
  const env = fixture()
  const { calls, execute } = cloud(env, {
    histories: { VITE_FIREBASE_API_KEY: [] },
  })
  assert.deepEqual(syncAppHostingSecrets(env, execute), {
    added: 1,
    skipped: 5,
  })
  assert(!calls.some((c) => c.args[1] === 'create'))
})

test('chooses the numerically latest version from unordered metadata', () => {
  const env = fixture()
  const { calls, execute } = cloud(env, {
    histories: {
      VITE_FIREBASE_API_KEY: [
        version('VITE_FIREBASE_API_KEY', 9),
        version('VITE_FIREBASE_API_KEY', 100),
        version('VITE_FIREBASE_API_KEY', 15),
      ],
    },
  })
  assert.equal(syncAppHostingSecrets(env, execute).added, 0)
  assert.equal(calls.find((c) => c.args[2] === 'access').args[3], '100')
})

for (const [before, after, added] of [
  [' 日本語\r\n改行\n ', ' 日本語\r\n改行\n ', 0],
  ['same', 'same\n', 1],
  [' same ', 'same', 1],
  ['日本語\r\n', '日本語\n', 1],
  ['', 'nonempty', 1],
])
  test(`compares exact UTF-8 bytes: ${JSON.stringify(before)} to ${JSON.stringify(after)}`, () => {
    const env = { ...fixture(), VITE_GOOGLE_MAPS_API_KEY: after }
    const { execute } = cloud(env, {
      values: { VITE_GOOGLE_MAPS_API_KEY: before },
    })
    assert.equal(syncAppHostingSecrets(env, execute).added, added)
  })

for (const state of ['DISABLED', 'DESTROYED'])
  test(`stops all writes when the latest version is ${state}`, () => {
    const env = fixture()
    const { calls, execute } = cloud(env, {
      missing: [secretNames[0]],
      histories: {
        VITE_GOOGLE_MAPS_MAP_ID: [
          version('VITE_GOOGLE_MAPS_MAP_ID', 14),
          version('VITE_GOOGLE_MAPS_MAP_ID', 15, state),
        ],
      },
    })
    assert.throws(() => syncAppHostingSecrets(env, execute), /not enabled/)
    assert.equal(writes(calls).length, 0)
  })

for (const [stage, output] of [
  ['secrets', 'not-json-sensitive-value'],
  ['secrets', '{}'],
  ['secrets', '[null]'],
  ['versions', '{}'],
  ['versions', JSON.stringify([version('OTHER_SECRET')])],
  ['versions', JSON.stringify([version('VITE_GOOGLE_MAPS_MAP_ID', 0)])],
  [
    'versions',
    JSON.stringify([version('VITE_GOOGLE_MAPS_MAP_ID', 15, 'UNKNOWN')]),
  ],
  ['access', 'not-json-sensitive-value'],
  ['access', 'null'],
  ['access', JSON.stringify({ name: version('VITE_GOOGLE_MAPS_MAP_ID').name })],
  ['access', payload('OTHER_SECRET', 'sensitive-value')],
  [
    'access',
    JSON.stringify({
      name: version('VITE_GOOGLE_MAPS_MAP_ID').name,
      payload: { data: 'invalid base64 sensitive-value' },
    }),
  ],
])
  test(`rejects malformed ${stage} response without writes or payload disclosure: ${output}`, () => {
    const env = fixture()
    const { calls, execute } = cloud(env, {
      missing: [secretNames[0]],
      intercept: ({ args }) => {
        if (stage === 'secrets' && args[1] === 'list') return output
        if (!args.includes('--secret=VITE_GOOGLE_MAPS_MAP_ID')) return
        if (stage === 'versions' && args[2] === 'list') return output
        if (stage === 'access' && args[2] === 'access') return output
      },
    })
    assert.throws(() => syncAppHostingSecrets(env, execute), {
      message: 'Invalid Secret Manager response; sync stopped.',
    })
    assert.equal(writes(calls).length, 0)
  })

for (const operation of ['list', 'access', 'add'])
  test(`stops on ${operation} failure and redacts error output`, () => {
    const env = fixture()
    const { calls, execute } = cloud(env, {
      values: { VITE_FIREBASE_API_KEY: 'previous-value' },
      intercept: ({ args }) => {
        if (args[2] === operation)
          throw new Error(
            `CLI diagnostic containing ${env.VITE_FIREBASE_API_KEY}`,
          )
      },
    })
    assert.throws(() => syncAppHostingSecrets(env, execute), {
      message:
        'gcloud secrets failed; check deployment IAM and API configuration.',
    })
    if (operation !== 'add') assert.equal(writes(calls).length, 0)
    else assert.equal(writes(calls).length, 1)
  })

test('CLI prints only counts on success and sanitized errors on command failure', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'secret-sync-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const env = fixture()
  const mock = `#!${process.execPath}
const values = ${JSON.stringify(env)};
const names = ${JSON.stringify(secretNames)};
const args = process.argv.slice(2);
if (process.env.MOCK_FAIL === 'true') {
  console.log(values.VITE_FIREBASE_API_KEY);
  console.error(values.VITE_GOOGLE_MAPS_API_KEY);
  process.exit(1);
}
const name = args.find(a => a.startsWith('--secret='))?.slice(9);
const resource = 'projects/test-project/secrets/' + name;
if (args[1] === 'list') console.log(JSON.stringify(names.map(n => ({name: 'projects/test-project/secrets/' + n}))));
else if (args[2] === 'list') console.log(JSON.stringify([{name: resource + '/versions/15', state: 'ENABLED'}]));
else if (args[2] === 'access') console.log(JSON.stringify({name: resource + '/versions/15', payload: {data: Buffer.from(values[name]).toString('base64')}}));
`
  for (const command of ['gcloud', 'pnpm'])
    writeFileSync(join(directory, command), mock, { mode: 0o700 })
  for (const failure of [false, true]) {
    const result = spawnSync(
      process.execPath,
      [new URL('./sync-apphosting-secrets.mjs', import.meta.url).pathname],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          ...env,
          PATH: directory + delimiter + process.env.PATH,
          MOCK_FAIL: String(failure),
        },
      },
    )
    assert.equal(result.status, failure ? 1 : 0)
    assert.equal(
      result.stdout,
      failure ? '' : 'App Hosting secrets synced: 0 added, 6 skipped.\n',
    )
    assert.equal(
      result.stderr,
      failure
        ? 'gcloud secrets failed; check deployment IAM and API configuration.\n'
        : '',
    )
  }
})
