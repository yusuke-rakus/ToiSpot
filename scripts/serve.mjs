import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

export function createStaticServer(
  directory = new URL('../dist/', import.meta.url),
) {
  const root = resolve(
    directory instanceof URL ? fileURLToPath(directory) : directory,
  )
  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    let pathname
    try {
      pathname = decodeURIComponent(request.url.split('?')[0])
    } catch {
      response.writeHead(400).end()
      return
    }
    let path = resolve(root, `.${pathname}`)
    if (!path.startsWith(`${root}${sep}`) && path !== root) {
      response.writeHead(403).end()
      return
    }
    // Only extensionless SPA routes fall back; missing assets must remain 404s.
    if (!extname(path)) path = resolve(root, 'index.html')
    try {
      const body = await readFile(path)
      response.writeHead(200, {
        'Content-Type':
          contentTypes[extname(path)] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      response.end(request.method === 'HEAD' ? undefined : body)
    } catch (error) {
      response
        .writeHead(
          ['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code) ? 404 : 500,
        )
        .end()
    }
  })
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = createStaticServer()
  server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0')
  process.on('SIGTERM', () => server.close())
}
