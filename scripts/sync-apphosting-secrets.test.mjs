import assert from 'node:assert/strict'
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

test('validates all secrets before any cloud changes', () => {
  const env = fixture()
  delete env.VITE_GOOGLE_MAPS_API_KEY
  assert.throws(
    () => syncAppHostingSecrets(env, () => assert.fail('cloud call')),
    /VITE_GOOGLE_MAPS_API_KEY is required/,
  )
  assert.throws(
    () =>
      syncAppHostingSecrets(
        { ...fixture(), VITE_FIREBASE_PROJECT_ID: 'wrong' },
        () => assert.fail('cloud call'),
      ),
    /must match/,
  )
})

test('creates missing secrets and passes exact values only through stdin', () => {
  const env = fixture()
  env.VITE_GOOGLE_MAPS_API_KEY = 'key with $() `quotes` and\nnewlines'
  const calls = []
  syncAppHostingSecrets(env, (command, args, input) => {
    calls.push({ command, args, input })
    return args[1] === 'list'
      ? 'projects/test-project/secrets/VITE_FIREBASE_API_KEY\n'
      : ''
  })
  assert.equal(calls.filter((c) => c.args[1] === 'create').length, 5)
  const versions = calls.filter((c) => c.args[1] === 'versions')
  assert.equal(versions.length, 6)
  for (const call of versions) {
    assert.equal(call.input, env[call.args[3]])
    assert.deepEqual(call.args, [
      'secrets',
      'versions',
      'add',
      call.args[3],
      '--data-file=-',
      '--project',
      env.FIREBASE_PROJECT_ID,
      '--quiet',
    ])
  }
  const grant = calls.at(-1)
  assert.equal(grant.command, 'pnpm')
  assert(grant.args.includes(secretNames.join(',')))
  assert(grant.args.includes(env.FIREBASE_APP_HOSTING_BACKEND_ID))
})

test('stops before access grants when a version upload fails', () => {
  const calls = []
  assert.throws(
    () =>
      syncAppHostingSecrets(fixture(), (command, args) => {
        calls.push(args)
        if (args[1] === 'versions') throw new Error('upload failed')
        return ''
      }),
    /upload failed/,
  )
  assert(!calls.some((args) => args.includes('apphosting:secrets:grantaccess')))
})
