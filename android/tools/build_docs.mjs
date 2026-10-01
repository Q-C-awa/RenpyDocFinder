/* ============================================================
 * RenpyDoc Finder 手机版 —— 文档数据打包脚本
 *
 * 把桌面版已经生成好的 data/（meta.js + 索引层分块 + 正文层分块）
 * 转换成 Android 工程里的 assets：
 *
 *   android/app/src/main/assets/docs/meta.json          元信息 + 侧边目录
 *   android/app/src/main/assets/docs/index-zh.ndjson    索引层（每行一页，供搜索）
 *   android/app/src/main/assets/docs/index-en.ndjson
 *   android/app/src/main/assets/docs/home-zh.html       首页正文
 *   android/app/src/main/assets/docs/home-en.html
 *   android/app/src/main/assets/docs/html/<lang>/<slug>.html   文章正文（按需读取）
 *   android/app/src/main/assets/docimg/<lang>/<file>    文档图片（--images 时下载）
 *
 * 用法：
 *   node android/tools/build_docs.mjs                 # 复用桌面版 data/，不下载图片
 *   node android/tools/build_docs.mjs --images        # 同时补齐文档图片
 *   node android/tools/build_docs.mjs --data-dir <目录> --out-dir <目录>
 * ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, copyFileSync } from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const androidRoot = resolve(__dirname, '..')
const appRoot = resolve(androidRoot, '..')
const workRoot = resolve(appRoot, '..')

function parseArgs(argv) {
  const args = { dataDir: null, outDir: null, images: false, langs: ['zh', 'en'] }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--data-dir' && argv[i + 1]) args.dataDir = argv[++i]
    else if (a === '--out-dir' && argv[i + 1]) args.outDir = argv[++i]
    else if (a === '--images') args.images = true
    else if (a === '--zh-only') args.langs = ['zh']
    else if (a === '--help' || a === '-h') {
      console.log('用法：node android/tools/build_docs.mjs [--data-dir 目录] [--out-dir 目录] [--images] [--zh-only]')
      process.exit(0)
    }
  }
  args.dataDir = args.dataDir || join(appRoot, 'data')
  args.outDir = args.outDir || join(androidRoot, 'app', 'src', 'main', 'assets', 'docs')
  return args
}

/* 在沙箱里执行桌面版的 chunk 文件，取出 push 进去的页数组 */
function loadChunks(file) {
  const src = readFileSync(file, 'utf8')
  const sandbox = { window: {} }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  const out = []
  for (const key of Object.keys(sandbox.window)) {
    const arr = sandbox.window[key]
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (Array.isArray(item)) out.push(...item)
        else if (item && typeof item === 'object') out.push(item)
      }
    }
  }
  return out
}

function readMeta(dataDir) {
  const text = readFileSync(join(dataDir, 'meta.js'), 'utf8')
  const start = text.indexOf('JSON.parse(')
  if (start === -1) throw new Error('meta.js 格式不正确：' + join(dataDir, 'meta.js'))
  const lit = text.slice(start + 'JSON.parse('.length, text.lastIndexOf(')')).trim()
  const json = JSON.parse(lit)
  return JSON.parse(json)
}

function ndjsonLine(page, lang) {
  const o = {
    slug: page.slug,
    title: page.title || page.slug,
    source: page.source || '',
    sections: (page.sections || []).map(function (s) {
      return { id: s.id || '', title: s.title || '', text: s.text || '' }
    }),
    terms: (page.terms || []).map(function (t) {
      return { id: t.id || '', name: t.name || '', kind: t.kind || 'api', alias: !!t.alias }
    })
  }
  return JSON.stringify(o)
}

async function fetchFirst(urls, timeoutMs) {
  for (const url of urls) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(function () { ctrl.abort() }, timeoutMs || 25000)
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'RenpyDoc-Mobile/1.0' } })
      clearTimeout(timer)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 32) continue
      return buf
    } catch (e) { /* 试下一个 */ }
  }
  return null
}

function localImage(cands) {
  for (const p of cands) {
    try { if (existsSync(p)) return p } catch (e) { /* ignore */ }
  }
  return null
}

async function collectImages(pagesByLang, assetsDir) {
  const jobs = new Map()
  for (const lang of Object.keys(pagesByLang)) {
    for (const item of pagesByLang[lang]) {
      const html = item.html || ''
      const re = /data-docimg="([^"]+)"/g
      let m
      while ((m = re.exec(html))) {
        const key = m[1]
        const isEn = key.indexOf('en/') === 0
        const rest = key.slice(key.indexOf('/') + 1)
        const file = rest.slice(rest.lastIndexOf('/') + 1)
        const noOshs = rest.indexOf('oshs/game/') === 0 ? rest.slice(10) : rest
        const destLang = isEn ? 'en' : 'zh'
        const dest = join(assetsDir, 'docimg', destLang, file)
        if (jobs.has(dest)) continue
        const locals = isEn
          ? [join(appRoot, 'docs_cache', 'en', file), join(workRoot, 'renpy_en', '_images', file),
             join(appRoot, 'assets', 'docimg', 'en', file)]
          : [join(appRoot, 'docs_cache', 'zh', 'source', rest), join(workRoot, 'renpy_cn', 'source', rest),
             join(appRoot, 'docs_cache', 'zh', 'source', noOshs), join(appRoot, 'assets', 'docimg', 'zh', rest),
             join(appRoot, 'assets', 'docimg', 'zh', noOshs)]
        const urls = isEn
          ? ['https://www.renpy.org/doc/html/_images/' + file,
             'https://www.renpy.org/doc/html/_images/' + rest]
          : ['https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/source/' + rest,
             'https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/' + rest,
             'https://cdn.jsdelivr.net/gh/renpy/renpy@master/gui/game/' + noOshs,
             'https://raw.githubusercontent.com/renpy/renpy/master/gui/game/' + noOshs,
             'https://www.renpy.org/doc/html/_images/' + file]
        jobs.set(dest, { locals: locals, urls: urls })
      }
    }
  }
  let ok = 0
  let fail = 0
  const entries = Array.from(jobs.entries())
  for (let i = 0; i < entries.length; i++) {
    const [dest, spec] = entries[i]
    mkdirSync(dirname(dest), { recursive: true })
    const local = localImage(spec.locals)
    if (local) {
      try { copyFileSync(local, dest); ok++; continue } catch (e) { /* 继续在线下载 */ }
    }
    const buf = await fetchFirst(spec.urls)
    if (buf) {
      writeFileSync(dest, buf)
      ok++
    } else {
      fail++
    }
    if ((i + 1) % 10 === 0) console.log('  图片 ' + (i + 1) + '/' + entries.length)
  }
  return { ok: ok, fail: fail, total: entries.length }
}

/* 把桌面版目录里只有 slug 的条目，用索引层的真实标题补全（中文目录显示中文名） */
function resolveNav(nav, titleMap) {
  if (!nav) return { groups: [] }
  const out = {}
  if (Array.isArray(nav.groups)) {
    out.groups = nav.groups.map(function (g) {
      const items = (g.items || []).map(function (it) {
        return { slug: it.slug, title: titleMap[it.slug] || it.title || it.slug }
      })
      return { caption: g.caption || '', items: items }
    })
  }
  if (Array.isArray(nav.extras)) {
    out.extras = nav.extras.map(function (it) {
      return { slug: it.slug, title: titleMap[it.slug] || it.title || it.slug }
    })
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv)
  if (!existsSync(join(args.dataDir, 'meta.js'))) {
    console.error('找不到桌面版数据：' + join(args.dataDir, 'meta.js'))
    console.error('请先在 renpy-doc-app 目录执行 node build/build.mjs 生成 data/ 后再运行本脚本。')
    process.exit(1)
  }

  const meta = readMeta(args.dataDir)
  console.log('数据来源：' + args.dataDir)
  console.log('输出去向：' + args.outDir)

  /* 清掉上一次的产物，避免残留旧分块 */
  for (const sub of ['html', 'index-zh.ndjson', 'index-en.ndjson', 'home-zh.html', 'home-en.html', 'meta.json']) {
    rmSync(join(args.outDir, sub), { recursive: true, force: true })
  }
  mkdirSync(args.outDir, { recursive: true })

  const pagesByLang = {}
  const titlesByLang = {}
  const summary = {}

  for (const lang of args.langs) {
    const chunkFiles = (meta.chunks && meta.chunks[lang]) || []
    const pageFiles = (meta.pages && meta.pages[lang]) || []
    if (!chunkFiles.length) {
      console.warn('跳过 ' + lang + '：meta.js 里没有分块清单')
      continue
    }

    /* 索引层：标题 / 分节 / 词条 / 首页正文 */
    const pages = []
    for (const name of chunkFiles) {
      const file = join(args.dataDir, basename(name))
      if (!existsSync(file)) throw new Error('缺少分块文件：' + file)
      pages.push(...loadChunks(file))
    }
    const bySlug = new Map()
    const titleMap = {}
    for (const p of pages) {
      bySlug.set(p.slug, p)
      titleMap[p.slug] = p.title || p.slug
    }
    titlesByLang[lang] = titleMap

    /* 正文层：每页 HTML */
    const htmlBySlug = new Map()
    for (const name of pageFiles) {
      const file = join(args.dataDir, basename(name))
      if (!existsSync(file)) continue
      for (const item of loadChunks(file)) {
        if (item && item.slug) htmlBySlug.set(item.slug, item.html || '')
      }
    }

    /* 首页正文 */
    const indexPage = bySlug.get('index')
    const homeHtml = (indexPage && indexPage.homeHtml) || htmlBySlug.get('index') || ''
    writeFileSync(join(args.outDir, 'home-' + lang + '.html'), homeHtml, 'utf8')

    /* 索引层 NDJSON */
    const lines = []
    for (const p of pages) {
      if (!p.slug) continue
      lines.push(ndjsonLine(p, lang))
    }
    writeFileSync(join(args.outDir, 'index-' + lang + '.ndjson'), lines.join('\n') + '\n', 'utf8')

    /* 正文：一页一个文件，App 里按 slug 直接读取 */
    const htmlDir = join(args.outDir, 'html', lang)
    mkdirSync(htmlDir, { recursive: true })
    const items = []
    let written = 0
    for (const p of pages) {
      if (!p.slug || p.slug === 'index') continue
      const html = htmlBySlug.get(p.slug) || ''
      writeFileSync(join(htmlDir, p.slug + '.html'), html, 'utf8')
      items.push({ slug: p.slug, html: html })
      written++
    }

    pagesByLang[lang] = items
    summary[lang] = { pages: pages.length, html: written }
    console.log('  ' + lang + '：索引 ' + pages.length + ' 页，正文 ' + written + ' 篇，首页 ' + homeHtml.length + ' 字节')
  }

  /* meta.json */
  const mobileMeta = {
    buildId: String(meta.generated || '') + '|' + String((meta.docZh && meta.docZh.version) || '') + '|' + String((meta.docEn && meta.docEn.version) || ''),
    generated: meta.generated || '',
    generator: 'RenpyDoc mobile packer',
    docZh: meta.docZh || {},
    docEn: meta.docEn || {},
    nav: {
      zh: resolveNav((meta.nav && meta.nav.zh) || {}, titlesByLang.zh || {}),
      en: resolveNav((meta.nav && meta.nav.en) || {}, titlesByLang.en || {})
    },
    counts: summary
  }
  writeFileSync(join(args.outDir, 'meta.json'), JSON.stringify(mobileMeta, null, 2), 'utf8')

  if (args.images) {
    console.log('下载文档图片…')
    const assetsDir = resolve(args.outDir, '..')
    const res = await collectImages(pagesByLang, assetsDir)
    console.log('  图片：成功 ' + res.ok + ' / 共 ' + res.total + '，失败 ' + res.fail)
  }

  console.log('')
  console.log('完成。用 Android Studio 打开 renpy-doc-app/android，Sync 后即可运行 / 打包。')
}

main().catch(function (e) {
  console.error('打包失败：' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
