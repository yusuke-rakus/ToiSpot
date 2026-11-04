import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory()
      ? markdownFiles(path)
      : entry.name.endsWith('.md')
        ? [path]
        : []
  })
}

function headings(source) {
  let previousLevel = 0
  let inCode = false
  const slugs = new Set()
  const slugCounts = new Map()
  for (const line of source.split('\n')) {
    if (/^```/.test(line)) inCode = !inCode
    if (inCode) continue
    const heading = line.match(/^(#{1,6}) (.+)$/)
    if (!heading) continue
    const level = heading[1].length
    assert(level <= previousLevel + 1, `見出し階層が飛んでいます: ${line}`)
    previousLevel = level
    const base = heading[2]
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\- ]/gu, '')
      .replace(/ /g, '-')
    const count = slugCounts.get(base) ?? 0
    slugs.add(count ? `${base}-${count}` : base)
    slugCounts.set(base, count + 1)
  }
  return slugs
}

const files = ['README.md', ...markdownFiles('docs')]
const documents = new Map(
  files.map((file) => [resolve(file), readFileSync(file, 'utf8')]),
)

for (const [file, source] of documents) {
  try {
    headings(source)
    for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
      const href = match[1]
      if (/^[a-z][a-z\d+.-]*:/i.test(href)) continue
      const [path, fragment] = href.split('#')
      const destination = path ? resolve(dirname(file), decodeURI(path)) : file
      assert(existsSync(destination), `リンク先がありません: ${href}`)
      if (fragment) {
        const target =
          documents.get(destination) ?? readFileSync(destination, 'utf8')
        assert(
          headings(target).has(decodeURIComponent(fragment)),
          `見出しがありません: ${href}`,
        )
      }
    }
  } catch (error) {
    throw new Error(`${file}: ${error.message}`, { cause: error })
  }
}

for (const [file, prefix, count] of [
  ['docs/requirements/README.md', 'R', 10],
  ['docs/decisions/README.md', 'Q', 13],
]) {
  const source = readFileSync(file, 'utf8')
  const ids = [
    ...source.matchAll(new RegExp(`^\\| (${prefix}-\\d+) \\|`, 'gm')),
  ].map((match) => match[1])
  assert.deepEqual(
    ids,
    Array.from(
      { length: count },
      (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`,
    ),
  )
}

console.log(
  `${files.length}文書のリンク・見出し階層と、要件10件・未決事項13件を確認しました。`,
)
