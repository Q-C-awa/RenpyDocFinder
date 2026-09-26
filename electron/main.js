/* RenPyDoc Finder — Electron 主进程
 * 提供：本地窗口加载 + 后台更新检测（绕过浏览器 CORS）+ 外部链接打开。
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const https = require('https')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { pathToFileURL } = require('url')

const UA = 'RenPyDoc-Finder/1.0'
const ZH_RAW = 'https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/source/'
const ZH_RAW_ROOT = 'https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/'
const EN_BASE = 'https://www.renpy.org/doc/html/'
const SDK_CDN = 'https://cdn.jsdelivr.net/gh/renpy/renpy@master/gui/game/'
const SDK_RAW = 'https://raw.githubusercontent.com/renpy/renpy/master/gui/game/'

function httpGet(url, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(new URL(res.headers.location, url).toString(), timeoutMs).then(resolve, reject)
        res.resume()
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error('HTTP ' + res.statusCode))
        return
      }
      const chunks = []
      res.on('data', function (c) { chunks.push(c) })
      res.on('end', function () {
        resolve(Buffer.concat(chunks).toString('utf8'))
      })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs || 10000, function () {
      req.destroy(new Error('timeout'))
    })
  })
}

function httpGetBuffer(url, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGetBuffer(new URL(res.headers.location, url).toString(), timeoutMs).then(resolve, reject)
        res.resume()
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error('HTTP ' + res.statusCode + ' ' + url))
        return
      }
      const chunks = []
      res.on('data', function (c) { chunks.push(c) })
      res.on('end', function () { resolve(Buffer.concat(chunks)) })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs || 20000, function () { req.destroy(new Error('timeout')) })
  })
}

async function downloadAll(items, workers) {
  let index = 0
  let ok = 0
  const failed = []
  async function worker() {
    while (index < items.length) {
      const item = items[index++]
      try {
        await fs.promises.mkdir(path.dirname(item.dest), { recursive: true })
        const buf = await httpGetBuffer(item.url, 25000)
        await fs.promises.writeFile(item.dest, buf)
        ok++
      } catch (e) {
        failed.push(item.url)
      }
    }
  }
  const pool = []
  for (let i = 0; i < (workers || 6); i++) pool.push(worker())
  await Promise.all(pool)
  return { ok: ok, failed: failed }
}

/* 依次尝试多个候选地址，第一个成功的写入 dest */
async function downloadFirst(urls, dest) {
  for (const url of urls) {
    try {
      const buf = await httpGetBuffer(url, 25000)
      if (!buf || buf.length < 64) continue
      await fs.promises.mkdir(path.dirname(dest), { recursive: true })
      await fs.promises.writeFile(dest, buf)
      return true
    } catch (e) { /* next */ }
  }
  return false
}

async function downloadMany(items, workers) {
  let index = 0
  let ok = 0
  const failed = []
  async function worker() {
    while (index < items.length) {
      const item = items[index++]
      const done = await downloadFirst(item.urls, item.dest)
      if (done) ok++
      else failed.push(item.urls[0])
    }
  }
  const pool = []
  for (let i = 0; i < (workers || 5); i++) pool.push(worker())
  await Promise.all(pool)
  return { ok: ok, failed: failed }
}

/* 收集并下载文档引用的图片：中文按 RST 引用，英文按 _images 引用 */
async function collectImages(cacheZh, cacheEn) {
  const items = []
  try {
    const zhFiles = (await fs.promises.readdir(cacheZh)).filter(function (f) { return f.endsWith('.rst') })
    const refs = new Set()
    for (const f of zhFiles) {
      const txt = await fs.promises.readFile(path.join(cacheZh, f), 'utf8')
      const re = /^\.\.\s+(?:image|figure)::\s*(\S+)/gm
      let m
      while ((m = re.exec(txt))) refs.add(m[1])
    }
    for (const ref of Array.from(refs)) {
      const dest = path.join(cacheZh, ref)
      if (fs.existsSync(dest)) continue
      const noOshs = ref.replace(/^oshs\/game\//, '')
      items.push({
        urls: [ZH_RAW + ref, ZH_RAW_ROOT + ref, SDK_CDN + noOshs, SDK_RAW + noOshs],
        dest: dest
      })
    }
  } catch (e) { /* ignore */ }
  try {
    const enFiles = (await fs.promises.readdir(cacheEn)).filter(function (f) { return f.endsWith('.html') })
    const names = new Set()
    for (const f of enFiles) {
      const txt = await fs.promises.readFile(path.join(cacheEn, f), 'utf8')
      const re = /_images\/([A-Za-z0-9_.\/-]+\.(?:png|jpe?g|gif|webp|svg))/g
      let m
      while ((m = re.exec(txt))) names.add(m[1])
    }
    for (const name of Array.from(names)) {
      const flat = name.split('/').pop()
      const dest = path.join(cacheEn, flat)
      if (fs.existsSync(dest)) continue
      items.push({
        urls: [EN_BASE + '_images/' + name, EN_BASE + '_images/' + flat],
        dest: dest
      })
    }
  } catch (e) { /* ignore */ }
  if (!items.length) return { ok: 0, failed: [] }
  return downloadMany(items, 5)
}

let syncing = false

/* 同步文档：下载最新中英文文档 -> 用内置构建脚本重建索引 -> 返回新数据目录 */
async function syncDocs(payload) {
  if (syncing) return { ok: false, message: '已有同步任务在进行中' }
  syncing = true
  try {
    const userData = app.getPath('userData')
    const cacheZh = path.join(userData, 'docs_cache', 'zh', 'source')
    const cacheEn = path.join(userData, 'docs_cache', 'en')
    const outDir = path.join(userData, 'data')
    const buildDir = path.join(userData, 'build')
    await fs.promises.mkdir(cacheZh, { recursive: true })
    await fs.promises.mkdir(cacheEn, { recursive: true })
    await fs.promises.mkdir(buildDir, { recursive: true })

    const appRoot = app.getAppPath()
    for (const f of ['core.js', 'build.mjs']) {
      const src = await fs.promises.readFile(path.join(appRoot, 'build', f))
      await fs.promises.writeFile(path.join(buildDir, f), src)
    }

    const items = []
    ;(payload && payload.zh ? payload.zh : []).forEach(function (slug) {
      items.push({ url: ZH_RAW + slug + '.rst', dest: path.join(cacheZh, slug + '.rst') })
    })
    ;(payload && payload.en ? payload.en : []).forEach(function (slug) {
      items.push({ url: EN_BASE + slug + '.html', dest: path.join(cacheEn, slug + '.html') })
    })
    if (!items.length) return { ok: false, message: '没有可下载的文档清单' }

    const dl = await downloadAll(items, 6)
    if (dl.ok === 0) {
      return { ok: false, message: '下载失败，请检查网络后重试' }
    }
    /* 文档引用到的图片也一起补齐 */
    const imgs = await collectImages(cacheZh, cacheEn)

    const args = [
      path.join(buildDir, 'build.mjs'),
      '--en-dir', cacheEn,
      '--zh-dir', cacheZh,
      '--out-dir', outDir
    ]
    const res = await new Promise(function (resolve) {
      const child = spawn(process.execPath, args, {
        env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }),
        cwd: buildDir
      })
      let out = ''
      let errOut = ''
      child.stdout.on('data', function (d) { out += d.toString() })
      child.stderr.on('data', function (d) { errOut += d.toString() })
      child.on('close', function (code) { resolve({ code: code, out: out, err: errOut }) })
      child.on('error', function (e) { resolve({ code: -1, out: out, err: String(e && e.message ? e.message : e) }) })
    })
    if (res.code !== 0) {
      return { ok: false, message: '索引重建失败：' + (res.err || res.out || '').slice(-300) }
    }
    return {
      ok: true,
      dataUrl: pathToFileURL(path.join(outDir, path.sep)).href,
      downloaded: dl.ok,
      failed: dl.failed.length,
      images: imgs.ok,
      imagesFailed: imgs.failed.length
    }
  } catch (e) {
    return { ok: false, message: String(e && e.message ? e.message : e) }
  } finally {
    syncing = false
  }
}

async function checkUpdates() {
  const out = { zh: null, en: null }
  try {
    const j = JSON.parse(await httpGet(
      'https://gitee.com/api/v5/repos/kurororo666/Renpydoc-ranslate/commits?per_page=1', 9000))
    const first = j && j.length ? j[0] : null
    if (first) {
      out.zh = {
        date: first.created_at ||
          (first.commit && first.commit.committer && first.commit.committer.date) || '',
        sha: first.sha || '',
        url: first.html_url || 'https://gitee.com/kurororo666/Renpydoc-ranslate'
      }
    }
  } catch (e) { /* 中文源失败不致命 */ }
  try {
    const t = await httpGet('https://www.renpy.org/doc/html/index.html', 9000)
    const m = t.match(/([\d]+\.[\d]+(?:\.[\d]+)?)\s+Documentation/)
    if (m) out.en = { version: m[1] }
  } catch (e) { /* 英文源失败不致命 */ }
  if (!out.zh && !out.en) throw new Error('网络不可用')
  return out
}

/* 图标解析：优先 PNG（打包脚本由 GIF 生成），其次 ICO，最后退回 GIF */
function resolveIconPath() {
  const dir = path.join(__dirname, '..', 'assets', 'ico')
  const candidates = ['window-icon.png', 'window-icon.ico', 'window-icon.gif']
  for (let i = 0; i < candidates.length; i++) {
    const p = path.join(dir, candidates[i])
    try {
      if (fs.existsSync(p)) return p
    } catch (e) { /* ignore */ }
  }
  return undefined
}

/* 崩溃与未捕获异常：写日志并在界面上弹窗，避免“闪退”没有任何提示 */
function reportFatal(where, err) {
  const text = '[' + new Date().toISOString() + '] ' + where + '\n' +
    (err && err.stack ? err.stack : String(err)) + '\n'
  try {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'error.log'), text)
  } catch (e) { /* ignore */ }
  try { console.error(text) } catch (e) { /* ignore */ }
  try {
    if (app.isReady()) {
      dialog.showErrorBox('RenpyDocFinder 启动失败', text.slice(0, 1500))
    }
  } catch (e) { /* ignore */ }
}

process.on('uncaughtException', function (err) { reportFatal('uncaughtException', err) })
process.on('unhandledRejection', function (err) { reportFatal('unhandledRejection', err) })

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#fef7ff',
    title: 'Renpy文档查询',
    icon: resolveIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  /* 固定窗口标题，避免被页面 title 覆盖 */
  win.on('page-title-updated', function (e) { e.preventDefault() })
  win.webContents.on('did-finish-load', function () {
    try { win.setTitle('Renpy文档查询') } catch (e) { /* ignore */ }
  })
  win.webContents.on('render-process-gone', function (event, details) {
    reportFatal('render-process-gone', JSON.stringify(details))
  })
  win.webContents.on('preload-error', function (event, preloadPath, error) {
    reportFatal('preload-error ' + preloadPath, error)
  })
  win.loadFile(path.join(__dirname, '..', 'index.html')).catch(function (err) {
    reportFatal('loadFile', err)
  })
  win.webContents.setWindowOpenHandler(function (details) {
    if (/^https?:\/\//i.test(details.url)) {
      shell.openExternal(details.url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
}

ipcMain.handle('rpd:update-check', function () { return checkUpdates() })
ipcMain.handle('rpd:sync-docs', function (event, payload) { return syncDocs(payload) })
ipcMain.handle('rpd:open-external', function (event, url) {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url)
    return true
  }
  return false
})

app.setName('RenpyDocFinder')
if (process.platform === 'win32') app.setAppUserModelId('com.renpydoc.finder')

app.whenReady().then(function () {
  try {
    createWindow()
  } catch (err) {
    reportFatal('createWindow', err)
  }
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
