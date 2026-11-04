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

export function parseAdminEmail(value: string | undefined): string | null {
  if (!value?.trim()) return null
  return z.email().parse(value.trim().toLowerCase())
}
