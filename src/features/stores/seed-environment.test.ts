import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  loadSeedEnvironment,
  parseAdminEmail,
} from '../../../scripts/lib/seed-environment'

it('管理者メールは.env→.env.local→シェルの順で上書きし、正規化する', () => {
  const directory = mkdtempSync(join(tmpdir(), 'toilet-map-env-'))
  try {
    writeFileSync(
      join(directory, '.env'),
      'ADMIN_GOOGLE_EMAIL=first@example.test\n',
    )
    writeFileSync(
      join(directory, '.env.local'),
      'ADMIN_GOOGLE_EMAIL=" Second@Example.Test "\n',
    )
    expect(
      parseAdminEmail(loadSeedEnvironment(directory, {}).ADMIN_GOOGLE_EMAIL),
    ).toBe('second@example.test')
    expect(
      parseAdminEmail(
        loadSeedEnvironment(directory, {
          ADMIN_GOOGLE_EMAIL: 'SHELL@example.test',
        }).ADMIN_GOOGLE_EMAIL,
      ),
    ).toBe('shell@example.test')
    expect(parseAdminEmail(' ')).toBeNull()
    expect(parseAdminEmail(undefined)).toBeNull()
    expect(() => parseAdminEmail('not-an-email')).toThrow()
  } finally {
    rmSync(directory, { recursive: true })
  }
})
