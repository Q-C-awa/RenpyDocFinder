/* ============================================================
 * RenPyDoc Finder — 文档更新脚本（Node，零依赖，Node >= 18）
 * 用法：
 *   node update_docs.mjs            # 更新文档 + 图片，并自动重建索引
 *   node update_docs.mjs --no-build # 只更新，不重建
 * 说明：
 *   中文：git 克隆/拉取 https://gitee.com/kurororo666/Renpydoc-ranslate
 *        并按 RST 中的 .. image:: / .. figure:: 引用抓取图片；
 *        引用 SDK GUI 模板（oshs/game/...）的图从 Ren'Py 源码仓库补齐
 *   英文：按本地清单下载 HTML，并按 _images/ 引用抓取官方图片
 * ============================================================ */
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = join(__dirname, '..')
const cacheRoot = join(appRoot, 'docs_cache')

const GITEE_REPO = 'https://gitee.com/kurororo666/Renpydoc-ranslate.git'
const GITEE_RAW = 'https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/'
const EN_BASE = 'https://www.renpy.org/doc/html/'
const SDK_CDN = 'https://cdn.jsdelivr.net/gh/renpy/renpy@master/gui/game/'
const SDK_RAW = 'https://raw.githubusercontent.com/renpy/renpy/master/gui/game/'
const UA = 'RenPyDoc-Finder/1.0'

function log(msg) { console.log(msg) }

async function fetchBuffer(url, retries) {
  let lastErr = null
  for (let i = 0; i < (retries || 2); i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw lastErr
}

async function saveFromCandidates(cands, dest) {
  for (const url of cands) {
    try {
      const buf = await fetchBuffer(url, 1)
      if (!buf || buf.length < 64) continue
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, buf)
      return url
    } catch (e) { /* try next */ }
  }
  return null
}

function extractImageRefs(text) {
  const out = []
  const seen = new Set()
  const re = /^\.\.\s+(?:image|figure)::\s*(\S+)/gm
  let m
  while ((m = re.exec(text))) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]) }
  }
  return out
}

async function updateZhImages(target) {
  const srcDir = join(target, 'source')
  if (!existsSync(srcDir)) return
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.rst'))
  const refs = new Set()
  for (const f of files) {
    for (const r of extractImageRefs(readFileSync(join(srcDir, f), 'utf8'))) refs.add(r)
  }
  if (!refs.size) return
  log('[中文图片] 引用 ' + refs.size + ' 个，开始抓取…')
  let ok = 0
  let fail = 0
  for (const ref of refs) {
    const dest = join(srcDir, ref)
    if (existsSync(dest)) { ok++; continue }
    const noOshs = ref.replace(/^oshs\/game\//, '')
    const cands = [
      GITEE_RAW + 'source/' + ref,
      GITEE_RAW + ref,
      SDK_CDN + noOshs,
      SDK_RAW + noOshs
    ]
    const used = await saveFromCandidates(cands, dest)
    if (used) ok++
    else fail++
  }
  log('[中文图片] 完成：成功 ' + ok + '，失败 ' + fail)
}

async function updateZh() {
  const target = join(cacheRoot, 'zh')
  if (existsSync(join(target, '.git'))) {
    log('[中文] 拉取最新提交…')
    try { execSync('git -C "' + target + '" pull --ff-only --depth 1', { stdio: 'inherit' }) } catch (e) { log('[中文] pull 失败，继续使用现有副本') }
  } else {
    log('[中文] 首次克隆仓库（浅克隆）…')
    mkdirSync(cacheRoot, { recursive: true })
    execSync('git clone --depth 1 "' + GITEE_REPO + '" "' + target + '"', { stdio: 'inherit' })
  }
  try {
    const head = execSync('git -C "' + target + '" log -1 --format=%h %ci', { encoding: 'utf8' }).trim()
    log('[中文] 当前提交：' + head)
  } catch (e) { /* ignore */ }
  await updateZhImages(target)
}

async function updateEn() {
  const target = join(cacheRoot, 'en')
  mkdirSync(target, { recursive: true })
  const srcDir = readdirSync(target).length ? target : join(appRoot, '..', 'renpy_en')
  if (!existsSync(srcDir)) {
    log('[英文] 找不到本地英文文档目录，无法确定下载清单。')
    return
  }
  const names = readdirSync(srcDir).filter((f) => f.endsWith('.html'))
  log('[英文] 待更新页面 ' + names.length + ' 个（源：' + srcDir + '）')
  let ok = 0
  let fail = 0
  const batch = 6
  for (let i = 0; i < names.length; i += batch) {
    const group = names.slice(i, i + batch)
    await Promise.all(group.map(async (name) => {
      try {
        const buf = await fetchBuffer(EN_BASE + name, 3)
        writeFileSync(join(target, name), buf)
        ok++
      } catch (e) {
        fail++
        log('  [英文] 失败 ' + name + '：' + (e && e.message ? e.message : e))
      }
    }))
    await new Promise((r) => setTimeout(r, 100))
  }
  log('[英文] 页面下载完成：成功 ' + ok + '，失败 ' + fail)

  /* 抓取 HTML 中引用的 _images 图片 */
  const imgNames = new Set()
  for (const f of readdirSync(target).filter((x) => x.endsWith('.html'))) {
    const txt = readFileSync(join(target, f), 'utf8')
    const re = /_images\/([A-Za-z0-9_.\/-]+\.(?:png|jpe?g|gif|webp|svg))/g
    let m
    while ((m = re.exec(txt))) imgNames.add(m[1])
  }
  if (imgNames.size) {
    log('[英文图片] 引用 ' + imgNames.size + ' 个，开始抓取…')
    let iok = 0
    let ifail = 0
    for (const name of imgNames) {
      const flat = basename(name)
      const dest = join(target, flat)
      if (existsSync(dest)) { iok++; continue }
      const used = await saveFromCandidates([EN_BASE + '_images/' + name, EN_BASE + '_images/' + flat], dest)
      if (used) iok++
      else ifail++
    }
    log('[英文图片] 完成：成功 ' + iok + '，失败 ' + ifail)
  }
}

async function main() {
  const noBuild = process.argv.includes('--no-build')
  log('== RenPyDoc 文档更新 ==')
  await updateZh()
  await updateEn()
  if (!noBuild) {
    log('[构建] 重建索引…')
    const r = spawnSync(process.execPath, [join(__dirname, 'build.mjs')], { stdio: 'inherit' })
    if (r.status !== 0) {
      log('[构建] 失败，请手动运行：node build/build.mjs')
      process.exit(1)
    }
  }
  log('== 完成 ==')
}

main().catch((e) => {
  console.error('更新失败：', e && e.message ? e.message : e)
  process.exit(1)
})
