/* ============================================================
 * RenPyDoc Finder — Node 构建脚本（零依赖，Node >= 18）
 * 用法：
 *   node build.mjs                     # 使用默认路径
 *   node build.mjs --en-dir ../renpy_en --zh-dir ../renpy_cn/source --out-dir data
 * 输出：data/meta.js + data/<lang>.chunk.N.js + data/manifest.json
 * 默认优先读取 docs_cache/（由 update_docs 更新下载），
 * 否则回退到工作目录旁的 renpy_en / renpy_cn/source。
 * ============================================================ */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = join(__dirname, '..')
const workRoot = join(appRoot, '..')

/* core.js 为无依赖纯脚本，直接以 new Function 载入 */
const coreSrc = readFileSync(join(__dirname, 'core.js'), 'utf8')
new Function(coreSrc)()
const C = globalThis.RPDCore
if (!C) {
  console.error('无法加载 build/core.js')
  process.exit(1)
}

function parseArgs(argv) {
  const args = { enDir: null, zhDir: null, outDir: null, chunkBytes: 1400000 }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--en-dir' && argv[i + 1]) args.enDir = argv[++i]
    else if (a === '--zh-dir' && argv[i + 1]) args.zhDir = argv[++i]
    else if (a === '--out-dir' && argv[i + 1]) args.outDir = argv[++i]
    else if (a === '--chunk-bytes' && argv[i + 1]) args.chunkBytes = parseInt(argv[++i], 10)
    else if (a === '--help' || a === '-h') { console.log('用法见文件头注释'); process.exit(0) }
  }
  const cacheEn = join(appRoot, 'docs_cache', 'en')
  const cacheZh = join(appRoot, 'docs_cache', 'zh', 'source')
  args.enDir = args.enDir || (existsSync(cacheEn) ? cacheEn : join(workRoot, 'renpy_en'))
  args.zhDir = args.zhDir || (existsSync(cacheZh) ? cacheZh : join(workRoot, 'renpy_cn', 'source'))
  args.outDir = args.outDir || join(appRoot, 'data')
  return args
}

function listFiles(dir, ext) {
  if (!existsSync(dir)) {
    console.error('目录不存在：' + dir)
    process.exit(1)
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .sort()
}

function readText(p) { return readFileSync(p, 'utf8') }

function build() {
  const args = parseArgs(process.argv)
  console.log('EN 目录: ' + args.enDir)
  console.log('ZH 目录: ' + args.zhDir)
  console.log('输出目录: ' + args.outDir)

  const enPages = []
  let enVersion = ''
  let enNav = []
  for (const f of listFiles(args.enDir, '.html')) {
    const slug = basename(f, '.html')
    if (slug === 'search') continue
    const raw = readText(join(args.enDir, f))
    const page = C.parseEn(raw, slug)
    page.source = 'renpy_en/' + slug + '.html'
    enPages.push(page)
    if (slug === 'index') {
      enVersion = C.enVersionFromHtml(raw)
      enNav = C.parseEnNav(raw)
    }
  }
  enPages.sort((a, b) => a.slug.localeCompare(b.slug))

  const zhPages = []
  const zhFiles = []
  let zhNav = { groups: [], extras: [] }

  /* 第一遍：收集全部  .. _label: 所属页面，用于跨文件 :ref: 解析 */
  const zhLabelMap = {}
  for (const f of listFiles(args.zhDir, '.rst')) {
    const slug = basename(f, '.rst')
    const raw = readText(join(args.zhDir, f))
    const lre = /^\.\. _([\w-]+):\s*$/gm
    let lm
    while ((lm = lre.exec(raw))) zhLabelMap[lm[1]] = slug
  }

  for (const f of listFiles(args.zhDir, '.rst')) {
    const slug = basename(f, '.rst')
    const raw = readText(join(args.zhDir, f))
    C.setZhLinkContext(zhLabelMap, slug)
    const page = C.parseZh(raw, slug)
    page.source = 'renpy_cn/source/' + slug + '.rst'
    zhPages.push(page)
    zhFiles.push({ name: slug, len: raw.length })
    if (slug === 'index') zhNav = C.parseZhNav(raw)
  }
  C.setZhLinkContext(null, '')
  zhPages.sort((a, b) => a.slug.localeCompare(b.slug))

  /* 英文 API 词条并入中文索引，中文界面可直接搜英文名 */
  const enBySlug = {}
  for (const p of enPages) enBySlug[p.slug] = p
  let aliases = 0
  for (const zp of zhPages) {
    const ep = enBySlug[zp.slug]
    if (!ep || !ep.terms) continue
    const seen = {}
    for (const t of zp.terms) seen[String(t.name).toLowerCase()] = 1
    for (const et of ep.terms) {
      const key = String(et.name).toLowerCase()
      if (seen[key]) continue
      zp.terms.push({ id: et.id, name: et.name, kind: et.kind, alias: true })
      seen[key] = 1
      aliases++
    }
  }

  const zhVersion = C.zhVersionFromFiles(zhFiles)
  const zhFilesOut = C.makeChunkFiles('zh', zhPages, args.chunkBytes)
  const enFilesOut = C.makeChunkFiles('en', enPages, args.chunkBytes)

  mkdirSync(args.outDir, { recursive: true })
  for (const f of zhFilesOut.concat(enFilesOut)) {
    writeFileSync(join(args.outDir, basename(f.name)), f.content, 'utf8')
  }

  /* 直接构造 meta（含原版侧边目录 nav） */
  const metaObj = {
    appVersion: '1.0.0',
    generated: new Date().toISOString(),
    generator: 'RenPyDoc core',
    docZh: {
      label: '\u4e2d\u6587\u7ffb\u8bd1',
      sourceUrl: 'https://gitee.com/kurororo666/Renpydoc-ranslate',
      sourcePath: 'renpy_cn/source',
      version: zhVersion,
      pages: zhPages.length
    },
    docEn: {
      label: '\u82f1\u6587\u539f\u7248',
      sourceUrl: 'https://www.renpy.org/doc/html/',
      sourcePath: 'renpy_en',
      version: enVersion,
      pages: enPages.length
    },
    update: {
      giteeRepo: 'kurororo666/Renpydoc-ranslate',
      giteeBranch: 'master',
      giteeApi: 'https://gitee.com/api/v5/repos/kurororo666/Renpydoc-ranslate/commits?per_page=1',
      enIndexUrl: 'https://www.renpy.org/doc/html/index.html',
      enDocsUrl: 'https://www.renpy.org/doc/html/'
    },
    nav: { zh: zhNav, en: { groups: enNav, extras: [] } },
    chunks: {
      zh: zhFilesOut.map(function (f) { return f.name }),
      en: enFilesOut.map(function (f) { return f.name })
    }
  }
  const metaFinal = 'window.RPD_META = JSON.parse(' + JSON.stringify(JSON.stringify(metaObj)) + ');\n'
  writeFileSync(join(args.outDir, 'meta.js'), metaFinal, 'utf8')

  const manifest = {
    appVersion: '1.0.0',
    generated: new Date().toISOString(),
    docZh: { source: 'https://gitee.com/kurororo666/Renpydoc-ranslate', version: zhVersion, pages: zhPages.length },
    docEn: { source: 'https://www.renpy.org/doc/html/', version: enVersion, pages: enPages.length },
    nav: metaObj.nav,
    chunks: metaObj.chunks
  }
  writeFileSync(join(args.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  const totalBytes = zhFilesOut.concat(enFilesOut).reduce((s, f) => s + C.byteLen(f.content), 0)
  console.log('')
  console.log('构建完成：')
  console.log('  中文页面   ' + zhPages.length + ' 页（版本 ' + zhVersion + '）')
  console.log('  英文页面   ' + enPages.length + ' 页（Ren\'Py ' + enVersion + '）')
  console.log('  英文词条并入 ' + aliases + ' 条（可直接搜英文 API 名）')
  console.log('  数据分块   zh x' + zhFilesOut.length + ' / en x' + enFilesOut.length)
  console.log('  数据总量   ' + (totalBytes / 1024 / 1024).toFixed(2) + ' MB')
}

build()
