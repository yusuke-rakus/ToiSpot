import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import { createStaticServer } from './serve.mjs'

let directory, server, baseUrl
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'toilet-map-server-'))
  await mkdir(join(directory, 'dist/assets'), { recursive: true })
  await writeFile(join(directory, 'private.txt'), 'private')
  await writeFile(join(directory, 'dist/index.html'), '<html>app</html>')
  await writeFile(join(directory, 'dist/assets/app.js'), 'console.log("app")')
  server = createStaticServer(join(directory, 'dist'))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
})

test('serves the SPA for direct routes and HEAD requests', async () => {
  for (const path of ['/', '/admin-login', '/admin-login?next=/']) {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), '<html>app</html>')
    assert.match(response.headers.get('content-type'), /^text\/html/)
  }
  const head = await fetch(`${baseUrl}/admin-login`, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
})

test('serves JavaScript with its MIME type and keeps missing assets as 404', async () => {
  const response = await fetch(`${baseUrl}/assets/app.js`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^text\/javascript/)
  assert.equal(await response.text(), 'console.log("app")')
  assert.equal((await fetch(`${baseUrl}/assets/missing.js`)).status, 404)
})

test('rejects traversal, malformed paths and writes', async () => {
  assert.equal((await fetch(`${baseUrl}/..%2fprivate.txt`)).status, 403)
  assert.equal((await fetch(`${baseUrl}/%ZZ`)).status, 400)
  assert.equal((await fetch(`${baseUrl}/`, { method: 'POST' })).status, 405)
})
