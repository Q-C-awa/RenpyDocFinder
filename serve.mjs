/* 极简静态服务器：node serve.mjs 后访问 http://127.0.0.1:8080 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}

createServer(function (req, res) {
  let p = decodeURIComponent((req.url || '/').split('?')[0])
  if (p === '/') p = '/index.html'
  const file = normalize(join(root, p))
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404); res.end('Not Found'); return
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
}).listen(8080, function () {
  console.log('RenPyDoc Finder running at http://127.0.0.1:8080')
})
