import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { z } from 'zod'

export function loadSeedEnvironment(
  directory = process.cwd(),
  shell: Record<string, string | undefined> = process.env,
) {
  const files: Record<string, string> = {}
  for (const name of ['.env', '.env.local']) {
    const path = join(directory, name)
    if (existsSync(path))
      Object.assign(files, parseEnv(readFileSync(path, 'utf8')))
  }
  return { ...files, ...shell }
}

export function parseAdminCredentials(env: Record<string, string | undefined>) {
  const email = env.ADMIN_EMAIL?.trim()
  const password = env.ADMIN_PASSWORD
  if (!email && !password) {
    if (env.ADMIN_GOOGLE_EMAIL?.trim())
      throw new Error(
        'ADMIN_GOOGLE_EMAILは廃止しました。ADMIN_EMAILとADMIN_PASSWORDを指定してください。',
      )
    return null
  }
  if (!email || !password)
    throw new Error('ADMIN_EMAILとADMIN_PASSWORDを両方指定してください。')
  if (
    !z.email().safeParse(email).success ||
    password.length < 6 ||
    password.length > 4096
  )
    throw new Error(
      'ADMIN_EMAILの形式とADMIN_PASSWORD（6〜4096文字）を確認してください。',
    )
  return { email: email.toLowerCase(), password }
}
