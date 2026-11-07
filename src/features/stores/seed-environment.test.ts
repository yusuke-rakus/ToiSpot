import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  loadSeedEnvironment,
  parseAdminCredentials,
} from '../../../scripts/lib/seed-environment'
import { getSeedTarget } from '../../../scripts/lib/seed-target'

it('認証情報は.env→.env.local→シェルで上書きし、パスワードの空白を保持する', () => {
  const directory = mkdtempSync(join(tmpdir(), 'toilet-map-env-'))
  try {
    writeFileSync(
      join(directory, '.env'),
      'ADMIN_EMAIL=first@example.test\nADMIN_PASSWORD=first-password\n',
    )
    writeFileSync(
      join(directory, '.env.local'),
      'ADMIN_EMAIL=" Second@Example.Test "\nADMIN_PASSWORD=" local-password "\n',
    )
    expect(parseAdminCredentials(loadSeedEnvironment(directory, {}))).toEqual({
      email: 'second@example.test',
      password: ' local-password ',
    })
    expect(
      parseAdminCredentials(
        loadSeedEnvironment(directory, {
          ADMIN_EMAIL: 'SHELL@example.test',
          ADMIN_PASSWORD: 'shell-password',
        }),
      ),
    ).toEqual({ email: 'shell@example.test', password: 'shell-password' })
  } finally {
    rmSync(directory, { recursive: true })
  }
})

it('両方未指定ならスキップし、不完全・不正・旧設定は値を含めず案内する', () => {
  expect(parseAdminCredentials({})).toBeNull()
  expect(
    parseAdminCredentials({ ADMIN_EMAIL: ' ', ADMIN_PASSWORD: '' }),
  ).toBeNull()
  for (const env of [
    { ADMIN_EMAIL: 'admin@example.test' },
    { ADMIN_PASSWORD: 'secret-password' },
    { ADMIN_EMAIL: 'invalid-email', ADMIN_PASSWORD: 'secret-password' },
    { ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'short' },
    { ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'x'.repeat(4097) },
  ]) {
    expect(() => parseAdminCredentials(env)).toThrow(
      /ADMIN_EMAIL.*ADMIN_PASSWORD/,
    )
    try {
      parseAdminCredentials(env)
    } catch (error) {
      expect(String(error)).not.toContain('secret-password')
      expect(String(error)).not.toContain('admin@example.test')
    }
  }
  expect(() =>
    parseAdminCredentials({ ADMIN_GOOGLE_EMAIL: 'old@example.test' }),
  ).toThrow('廃止')
})

it('Authも接続先をローカル19090番だけに限定する', () => {
  expect(
    getSeedTarget({ FIREBASE_AUTH_EMULATOR_HOST: 'localhost:19090' }).authHost,
  ).toBe('localhost:19090')
  for (const host of [
    'example.com:19090',
    '127.0.0.1:9099',
    'http://localhost:19090',
    '',
  ]) {
    expect(() => getSeedTarget({ FIREBASE_AUTH_EMULATOR_HOST: host })).toThrow()
  }
})
