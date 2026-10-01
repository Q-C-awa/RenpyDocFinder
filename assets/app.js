/* ============================================================
 * RenPyDoc Finder — application logic
 * 布局：原版式左侧目录 + 主内容区；搜索：字符匹配 / 模糊容错
 * / 多词布尔 / API 词条命中；中英对照；深浅色主题；更新检测。
 * 零依赖，兼容 file:// 与各打包外壳。
 * ============================================================ */
(function () {
  'use strict'

  var META = (typeof window !== 'undefined' && window.RPD_META) || null
  var DEFAULT_META = META

  /* ---------------- 状态 ---------------- */
  var state = {
    lang: 'zh',
    theme: 'auto',
    data: { zh: null, en: null },
    idx: { zh: null, en: null },
    loadedChunks: { zh: {}, en: {} },
    loading: { zh: false, en: false },
    pagesLoaded: { zh: false, en: false },
    pagesLoading: { zh: null, en: null },
    pageMap: { zh: null, en: null },
    query: '',
    filter: 'all',
    results: null,
    selected: -1,
    mode: 'home',            /* home | page | results */
    baseMode: 'home',        /* 页面返回时的落点 */
    stack: [],               /* 页面栈 [{slug,lang,anchor}] */
    current: null,           /* 当前页 {slug,lang} */
    lastTokens: [],
    dataBase: ''
  }

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('rpd.' + k); return v === null ? d : v } catch (e) { return d }
    },
    set: function (k, v) {
      try { localStorage.setItem('rpd.' + k, v) } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- 工具 ---------------- */
  function $(sel) { return document.querySelector(sel) }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  function debounce(fn, ms) {
    var t = null
    return function () {
      var args = arguments
      if (t) clearTimeout(t)
      t = setTimeout(function () { fn.apply(null, args) }, ms)
    }
  }
  function iconRef(name) {
    return '<svg><use href="#i-' + name + '"></use></svg>'
  }
  function toast(html, ms) {
    var sb = $('#snackbar')
    sb.innerHTML = html
    sb.classList.add('show')
    clearTimeout(toast._t)
    toast._t = setTimeout(function () { sb.classList.remove('show') }, ms || 3600)
  }
  /* 品牌图标：按 png / gif / jpg / ico 顺序探测，全失败则用内联 SVG 兜底 */
  function resolveBrandIcon() {
    var img = document.getElementById('brandIcon')
    var fb = document.getElementById('brandIconFallback')
    if (!img) return
    var cands = [
      'assets/ico/window-icon.png',
      'assets/ico/window-icon.gif',
      'assets/ico/window-icon.jpg',
      'assets/ico/window-icon.jpeg',
      'assets/ico/window-icon.ico',
      'assets/ico/window-icon.svg'
    ]
    var i = 0
    function tryNext() {
      if (i >= cands.length) {
        img.style.display = 'none'
        if (fb) fb.style.display = 'block'
        return
      }
      var src = cands[i++]
      var probe = new Image()
      probe.onload = function () {
        img.src = src
        img.style.display = 'block'
        if (fb) fb.style.display = 'none'
      }
      probe.onerror = tryNext
      probe.src = src
    }
    tryNext()
  }

  function setProgress(on, pct) {
    var pb = $('#progressBar')
    if (!on) { pb.classList.remove('on'); return }
    pb.classList.add('on')
    pb.querySelector('.progress-inner').style.width = (pct || 8) + '%'
  }

  var CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

  function normalizeWs(s) { return String(s || '').replace(/\s+/g, ' ').trim() }

  function levenshtein(a, b) {
    if (a === b) return 0
    var m = a.length, n = b.length
    if (!m) return n
    if (!n) return m
    var prev = [], cur = []
    var i, j
    for (i = 0; i <= n; i++) prev[i] = i
    for (i = 1; i <= m; i++) {
      cur[0] = i
      for (j = 1; j <= n; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      }
      var tmp = prev; prev = cur; cur = tmp
    }
    return prev[n]
  }

  function trigramsOf(s) {
    var out = []
    for (var i = 0; i + 3 <= s.length; i++) out.push(s.slice(i, i + 3))
    return out
  }

  function subseqPositions(text, needle) {
    var pos = []
    var ti = 0
    for (var i = 0; i < text.length && ti < needle.length; i++) {
      if (text.charAt(i) === needle.charAt(ti)) { pos.push(i); ti++ }
    }
    return ti === needle.length ? pos : null
  }

  function regexEscape(s) { return s.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&') }

  /* ---------------- DOM ---------------- */
  var els = {
    topBar: $('#topBar'),
    searchInput: $('#searchInput'),
    searchClear: $('#searchClear'),
    langSeg: $('#langSeg'),
    btnTheme: $('#btnTheme'),
    btnUpdate: $('#btnUpdate'),
    updateBadge: $('#updateBadge'),
    btnMenu: $('#btnMenu'),
    brand: $('#brand'),
    sidebar: $('#sidebar'),
    sidebarNav: $('#sidebarNav'),
    sidebarCount: $('#sidebarCount'),
    scrim: $('#scrim'),
    viewHome: $('#viewHome'),
    viewResults: $('#viewResults'),
    filterChips: $('#filterChips'),
    resultsList: $('#resultsList'),
    resultsCount: $('#resultsCount'),
    emptyState: $('#emptyState'),
    viewPage: $('#viewPage'),
    scroller: $('#main'),
    pageBack: $('#pageBack'),
    pageTitle: $('#pageTitle'),
    pageToc: $('#pageToc'),
    pageBody: $('#pageBody'),
    topSource: $('#topSource'),
    statusZh: $('#statusZh'),
    statusEn: $('#statusEn'),
    statusGenerated: $('#statusGenerated'),
    statusUpdate: $('#statusUpdate')
  }

  /* ---------------- 主题 ---------------- */
  function applyTheme(theme) {
    var dark = false
    if (theme === 'dark') dark = true
    else if (theme === 'auto') dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    state.theme = theme
    store.set('theme', theme)
  }
  function toggleTheme() {
    var next = state.theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    toast('已切换为' + (next === 'dark' ? '深色' : '浅色') + '主题')
  }

  /* ---------------- 数据加载 ---------------- */
  function loadLangData(lang, onProgress) {
    var data = state.data[lang]
    if (data) return Promise.resolve(data)
    if (state.loading[lang]) return state.loading[lang]
    if (!META || !META.chunks || !META.chunks[lang]) {
      return Promise.reject(new Error('no-meta'))
    }
    var list = META.chunks[lang]
    var globalName = 'RPD_' + lang.toUpperCase() + '_CHUNKS'
    window[globalName] = window[globalName] || []
    var done = 0
    var promise = new Promise(function (resolve, reject) {
      var remaining = list.length
      if (!remaining) { finishLoad(); return }
      list.forEach(function (name) {
        var key = name.split('/').pop()
        if (state.loadedChunks[lang][key]) { chunkDone(); return }
        var s = document.createElement('script')
        s.src = resolveDataUrl(name)
        s.onload = function () { state.loadedChunks[lang][key] = true; chunkDone() }
        s.onerror = function () {
          state.loading[lang] = null
          reject(new Error('chunk-load-failed:' + name))
        }
        document.head.appendChild(s)
      })
      function chunkDone() {
        done++
        if (onProgress) onProgress(done / list.length)
        if (done >= list.length) finishLoad()
      }
      function finishLoad() {
        var arr = window[globalName] || []
        var pages = []
        for (var i = 0; i < arr.length; i++) pages = pages.concat(arr[i])
        /* 索引层数据：正文 HTML 为空（首页正文内联在 homeHtml） */
        for (var k = 0; k < pages.length; k++) {
          var pg = pages[k]
          pg.html = pg.homeHtml || pg.html || null
          delete pg.homeHtml
        }
        var pmap = Object.create(null)
        for (var m = 0; m < pages.length; m++) pmap[pages[m].slug] = pages[m]
        state.pageMap[lang] = pmap
        state.data[lang] = pages
        state.loading[lang] = null
        resolve(pages)
      }
    })
    state.loading[lang] = promise
    return promise
  }

  /* 分块文件定位：默认相对应用目录；使用自定义数据目录时用该目录 + 文件名 */
  function resolveDataUrl(name) {
    if (!state.dataBase) return name
    return state.dataBase + String(name).replace(/^data\//, '')
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script')
      s.src = src
      s.onload = function () { resolve(null) }
      s.onerror = function () { reject(new Error('load-failed: ' + src)) }
      document.head.appendChild(s)
    })
  }

  /* 切换到新的数据目录（同步更新后使用） */
  function reloadWithBase(base) {
    return loadScript(base + 'meta.js').then(function () {
      META = window.RPD_META
      META.__base = base
      state.dataBase = base
      state.data = { zh: null, en: null }
      state.idx = { zh: null, en: null }
      state.pageMap = { zh: null, en: null }
      state.loadedChunks = { zh: {}, en: {} }
      state.loading = { zh: false, en: false }
      state.pagesLoaded = { zh: false, en: false }
      state.pagesLoading = { zh: null, en: null }
      window.RPD_ZH_CHUNKS = []
      window.RPD_EN_CHUNKS = []
      window.RPD_ZH_PAGES = []
      window.RPD_EN_PAGES = []
      store.set('dataBase', base)
      return ensureLang(state.lang).catch(function (err) {
        /* 新数据不可用时回退到内置数据 */
        state.dataBase = ''
        store.set('dataBase', '')
        META = DEFAULT_META
        state.data = { zh: null, en: null }
        state.idx = { zh: null, en: null }
        state.loadedChunks = { zh: {}, en: {} }
        state.loading = { zh: false, en: false }
        window.RPD_ZH_CHUNKS = []
        window.RPD_EN_CHUNKS = []
        return ensureLang(state.lang).then(function () { throw err })
      })
    }).then(function () {
      renderSidebar()
      renderStatus()
      if (state.mode === 'page' && state.current) {
        openPage(state.current.slug, state.current.lang, null, false)
      } else if (state.mode === 'results' && state.query.trim()) {
        state.results = null
        runSearch()
      } else {
        renderHome()
      }
      toast('文档已同步更新完成')
    })
  }

  /* 让外壳（Electron / pywebview）下载最新文档并重建索引 */
  function allNavSlugs(lang) {
    var out = []
    var nav = (META && META.nav && META.nav[lang]) || {}
    var groups = Array.isArray(nav.groups) ? nav.groups.slice() : []
    var extras = Array.isArray(nav.extras) ? nav.extras : []
    if (extras.length) groups.push({ items: extras })
    groups.forEach(function (g) {
      var items = Array.isArray(g.items) ? g.items : []
      items.forEach(function (it) {
        if (it && it.slug && out.indexOf(it.slug) === -1) out.push(it.slug)
      })
    })
    if (out.indexOf('index') === -1) out.push('index')
    return out
  }

  function syncDocs() {
    var zhSlugs = (state.data.zh || []).map(function (x) { return x.slug })
    var enSlugs = (state.data.en || []).map(function (x) { return x.slug })
    if (!zhSlugs.length) zhSlugs = allNavSlugs('zh')
    if (!enSlugs.length) enSlugs = allNavSlugs('en')
    var payload = { zh: zhSlugs, en: enSlugs }
    if (window.renpyDocUpdate && typeof window.renpyDocUpdate.syncDocs === 'function') {
      return Promise.resolve(window.renpyDocUpdate.syncDocs(payload))
    }
    if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.sync_docs === 'function') {
      return Promise.resolve(window.pywebview.api.sync_docs(payload))
    }
    return Promise.resolve({
      ok: false,
      reason: 'unsupported',
      message: '当前为浏览器模式，无法自动重建索引。请运行 build/update_docs.mjs 后再执行 node build/build.mjs，或使用桌面版（Electron / pywebview）。'
    })
  }

  /* 正文层：首次打开文档页时才加载 */
  function ensurePages(lang) {
    if (state.pagesLoaded[lang]) return Promise.resolve(state.data[lang])
    if (state.pagesLoading[lang]) return state.pagesLoading[lang]
    var list = (META && META.pages && META.pages[lang]) || []
    var globalName = 'RPD_' + lang.toUpperCase() + '_PAGES'
    window[globalName] = window[globalName] || []
    var promise = new Promise(function (resolve, reject) {
      if (!list.length) { merge(); return }
      var remaining = list.length
      list.forEach(function (name) {
        var s = document.createElement('script')
        s.src = resolveDataUrl(name)
        s.onload = function () { if (--remaining <= 0) merge() }
        s.onerror = function () {
          state.pagesLoading[lang] = null
          reject(new Error('pages-load-failed: ' + name))
        }
        document.head.appendChild(s)
      })
      function merge() {
        var arr = window[globalName] || []
        var map = state.pageMap[lang] || {}
        for (var i = 0; i < arr.length; i++) {
          var chunk = arr[i]
          for (var k = 0; k < chunk.length; k++) {
            var item = chunk[k]
            var pg = map[item.slug]
            if (pg) pg.html = item.html
          }
        }
        state.pagesLoaded[lang] = true
        state.pagesLoading[lang] = null
        resolve(state.data[lang])
      }
    })
    state.pagesLoading[lang] = promise
    return promise
  }

  /* 搜索索引：启动后空闲时构建，避免阻塞首屏；用户提前搜索则即时构建 */
  function ensureIndex(lang) {
    if (state.idx[lang]) return state.idx[lang]
    return buildIndex(lang)
  }

  function buildIndexWhenIdle(lang) {
    var run = function () { try { ensureIndex(lang) } catch (e) { /* ignore */ } }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 })
    else setTimeout(run, 300)
  }

  function ensureLang(lang) {
    return loadLangData(lang, function (p) { setProgress(true, 10 + p * 80) })
      .then(function () { setProgress(false); return state.data[lang] })
      .catch(function (err) {
        setProgress(false)
        toast('数据加载失败：' + esc(err && err.message ? err.message : err), 6000)
        throw err
      })
  }

  /* ---------------- 索引构建 ---------------- */
  function buildIndex(lang) {
    var pages = state.data[lang]
    var idx = {
      lang: lang,
      pages: pages,
      bySlug: Object.create(null),
      entries: [],
      terms: [],
      termByName: Object.create(null)
    }
    var pi, si, i, j
    for (pi = 0; pi < pages.length; pi++) {
      var p = pages[pi]
      idx.bySlug[p.slug] = p
      for (si = 0; si < (p.sections || []).length; si++) {
        var sec = p.sections[si]
        var secText = normalizeWs(sec.text || '')
        var fullText = normalizeWs((sec.title || '') + ' ' + secText + ' ' + (p.title || ''))
        var entry = {
          pi: pi, si: si,
          page: p, sec: sec,
          text: fullText,
          title: normalizeWs(sec.title || ''),
          pageTitle: normalizeWs(p.title || ''),
          cjk: '', bis: Object.create(null), words: [], wordSet: Object.create(null)
        }
        var t = fullText.toLowerCase()
        var cjk = ''
        for (i = 0; i < t.length; i++) {
          var ch = t.charAt(i)
          if (CJK_RE.test(ch)) cjk += ch
        }
        entry.cjk = cjk
        for (i = 0; i + 1 < cjk.length; i++) entry.bis[cjk.slice(i, i + 2)] = 1
        var wm = t.match(/[a-z0-9_$]+(?:\.[a-z0-9_$]+)*/g) || []
        for (i = 0; i < wm.length; i++) {
          var w = wm[i]
          if (entry.wordSet[w]) continue
          entry.wordSet[w] = 1
          entry.words.push(w)
          var parts = w.split('.')
          for (j = 0; j < parts.length; j++) {
            if (parts[j] && parts[j] !== w && !entry.wordSet[parts[j]]) {
              entry.wordSet[parts[j]] = 1
              entry.words.push(parts[j])
            }
          }
        }
        idx.entries.push(entry)
      }
      for (i = 0; i < (p.terms || []).length; i++) {
        var tm = p.terms[i]
        var te = { pi: pi, page: p, term: tm, name: String(tm.name || ''), kind: tm.kind || 'api', alias: !!tm.alias }
        idx.terms.push(te)
        var key = te.name.toLowerCase()
        if (!Object.prototype.hasOwnProperty.call(idx.termByName, key)) idx.termByName[key] = te
      }
    }
    state.idx[lang] = idx
    return idx
  }

  /* ---------------- 查询解析 ---------------- */
  function makeToken(raw) {
    var norm = raw.toLowerCase()
    var cjk = CJK_RE.test(norm)
    var isPhrase = /\s/.test(norm.trim())
    var cjkChars = null
    if (cjk) {
      var buf = ''
      for (var i = 0; i < norm.length; i++) {
        var ch = norm.charAt(i)
        if (CJK_RE.test(ch)) buf += ch
      }
      cjkChars = buf
    }
    return { raw: raw, norm: norm, cjk: cjk, isPhrase: isPhrase, cjkChars: cjkChars }
  }

  function tokenizeQuery(q) {
    var tokens = []
    var re = /"([^"]+)"|'([^']+)'|\S+/g
    var m
    while ((m = re.exec(q))) {
      var raw = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[0])
      if (raw) tokens.push(makeToken(raw))
    }
    return tokens
  }

  /* ---------------- 匹配打分 ---------------- */
  function countChar(s, c) {
    var n = 0
    for (var i = 0; i < s.length; i++) if (s.charAt(i) === c) n++
    return n
  }

  function wordRanges(text, word) {
    var ranges = []
    var idx = 0
    var lower = text.toLowerCase()
    var w = word.toLowerCase()
    while (idx < lower.length) {
      var pos = lower.indexOf(w, idx)
      if (pos === -1) break
      ranges.push([pos, pos + w.length])
      idx = pos + 1
    }
    return ranges
  }

  function tokenScoreEntry(entry, token) {
    if (token.isPhrase) {
      var lp = entry.text.toLowerCase().indexOf(token.norm)
      if (lp === -1) return null
      return { score: 90 - Math.min(lp, 60) * 0.25, ranges: [[lp, lp + token.norm.length]] }
    }
    if (token.cjk) {
      var cs = token.cjkChars
      if (!cs) return null
      if (cs.length === 1) {
        var cnt = countChar(entry.cjk, cs)
        if (!cnt) return null
        var p1 = entry.cjk.indexOf(cs)
        return { score: 26 + Math.min(cnt, 5) * 3, ranges: [[p1, p1 + 1]] }
      }
      var exact = entry.cjk.indexOf(cs)
      if (exact !== -1) {
        return { score: 100 - Math.min(exact, 60) * 0.3, ranges: [[exact, exact + cs.length]] }
      }
      var bigrams = []
      var i
      for (i = 0; i + 1 < cs.length; i++) bigrams.push(cs.slice(i, i + 2))
      var hit = 0
      for (i = 0; i < bigrams.length; i++) if (entry.bis[bigrams[i]]) hit++
      var cover = hit / bigrams.length
      var seq = subseqPositions(entry.cjk, cs)
      if (cover === 1 && seq) {
        var gap = seq[seq.length - 1] - seq[0] + 1
        var density = cs.length / gap
        var ranges = seq.map(function (p) { return [p, p + 1] })
        return { score: 52 + density * 28, ranges: ranges }
      }
      if (cover >= 0.5 && seq) {
        var ranges2 = seq.map(function (p) { return [p, p + 1] })
        return { score: 22 + cover * 30, ranges: ranges2 }
      }
      return null
    }
    /* latin */
    var name = token.norm
    if (!name) return null
    if (entry.wordSet[name]) return { score: 100, ranges: wordRanges(entry.text, name) }
    var w, i
    var bestPrefix = null
    for (w = 0; w < entry.words.length; w++) {
      var wd = entry.words[w]
      if (wd.length > name.length && wd.indexOf(name) === 0) {
        if (!bestPrefix || wd.length < bestPrefix.length) bestPrefix = wd
      }
    }
    if (bestPrefix) {
      return { score: 52 + Math.min(name.length / Math.max(bestPrefix.length, 1) * 22, 22), ranges: wordRanges(entry.text, bestPrefix) }
    }
    var bestSub = null
    for (w = 0; w < entry.words.length; w++) {
      var wd2 = entry.words[w]
      if (wd2.length > name.length && wd2.indexOf(name) !== -1) {
        if (!bestSub || wd2.length < bestSub.length) bestSub = wd2
      }
    }
    if (bestSub) return { score: 44, ranges: wordRanges(entry.text, bestSub) }
    /* 模糊相似度：按需对候选词计算 trigram Dice（长度差 > 3 直接跳过） */
    var tgrams = trigramsOf(name)
    var bestDice = 0, bestWord = null
    if (tgrams.length) {
      var tset = Object.create(null)
      for (i = 0; i < tgrams.length; i++) tset[tgrams[i]] = 1
      for (w = 0; w < entry.words.length; w++) {
        var wd3 = entry.words[w]
        if (Math.abs(wd3.length - name.length) > 3) continue
        var wtri = trigramsOf(wd3)
        if (!wtri.length) continue
        var common = 0
        var wset = Object.create(null)
        for (i = 0; i < wtri.length; i++) {
          if (!wset[wtri[i]]) { wset[wtri[i]] = 1; if (tset[wtri[i]]) common++ }
        }
        var wl = 0
        for (var k in wset) if (Object.prototype.hasOwnProperty.call(wset, k)) wl++
        var dice = (2 * common) / (tgrams.length + wl)
        if (dice > bestDice) { bestDice = dice; bestWord = wd3 }
      }
    }
    if (bestDice >= 0.55 && bestWord) {
      return { score: 20 + bestDice * 35, ranges: wordRanges(entry.text, bestWord) }
    }
    if (name.length >= 3) {
      var maxD = name.length >= 6 ? 2 : 1
      for (w = 0; w < entry.words.length; w++) {
        var wd4 = entry.words[w]
        if (Math.abs(wd4.length - name.length) <= maxD && levenshtein(wd4, name) <= maxD) {
          return { score: 18, ranges: wordRanges(entry.text, wd4) }
        }
      }
    }
    var parts = name.split(/(?=[A-Z])/)
    if (parts.length > 1) {
      var ok = true
      for (i = 0; i < parts.length; i++) {
        if (entry.text.toLowerCase().indexOf(parts[i].toLowerCase()) === -1) { ok = false; break }
      }
      if (ok) return { score: 40, ranges: [] }
    }
    return null
  }

  function tokenScoreTerm(te, token) {
    if (token.cjk || token.isPhrase) return null
    var n = te.name.toLowerCase()
    var q = token.norm
    if (!n || !q) return null
    if (n === q) return 150
    if (n.indexOf(q) === 0) return 78 + Math.min(q.length / Math.max(n.length, 1) * 22, 22)
    if (n.indexOf(q) !== -1) return 64
    var tgrams = trigramsOf(q)
    var ngrams = Object.create(null)
    var i
    var tri = trigramsOf(n)
    for (i = 0; i < tri.length; i++) ngrams[tri[i]] = 1
    if (tgrams.length && tri.length) {
      var common = 0
      for (i = 0; i < tgrams.length; i++) if (ngrams[tgrams[i]]) common++
      var dice = (2 * common) / (tgrams.length + tri.length)
      if (dice >= 0.6) return 30 + dice * 35
    }
    if (q.length >= 4 && levenshtein(n, q) <= 2) return 28
    return null
  }

  function titleBonus(entry, token) {
    var b = 0
    if (token.cjk && token.cjkChars) {
      var cs = token.cjkChars
      if (entry.title.indexOf(cs) !== -1) b += 20
      if (entry.pageTitle.indexOf(cs) !== -1) b += 32
    } else if (!token.isPhrase) {
      var q = token.norm
      var t1 = entry.title.toLowerCase()
      var t2 = entry.pageTitle.toLowerCase()
      if (t1.indexOf(q) !== -1) b += 20
      if (t2.indexOf(q) !== -1) b += 32
    }
    return b
  }

  function matchGroup(idx, tokens) {
    if (!tokens.length) return null
    var matched = null
    var t
    for (t = 0; t < tokens.length; t++) {
      var token = tokens[t]
      var cur = {}
      for (var e = 0; e < idx.entries.length; e++) {
        var entry = idx.entries[e]
        var r = tokenScoreEntry(entry, token)
        if (r) cur['e' + e] = { entry: entry, score: r.score, ranges: r.ranges }
      }
      if (!Object.keys(cur).length) return null
      if (matched === null) {
        matched = cur
      } else {
        var inter = {}
        for (var k in cur) {
          if (Object.prototype.hasOwnProperty.call(matched, k)) {
            inter[k] = {
              entry: cur[k].entry,
              score: matched[k].score + cur[k].score,
              ranges: matched[k].ranges.concat(cur[k].ranges)
            }
          }
        }
        matched = inter
        if (!Object.keys(matched).length) return null
      }
    }
    var out = []
    for (var k2 in matched) {
      if (!Object.prototype.hasOwnProperty.call(matched, k2)) continue
      var m2 = matched[k2]
      var bonus = 0
      for (t = 0; t < tokens.length; t++) bonus += titleBonus(m2.entry, tokens[t])
      out.push({ entry: m2.entry, score: m2.score + bonus, ranges: m2.ranges })
    }
    out.sort(function (a, b) { return b.score - a.score })
    return out
  }

  /* ---------------- 搜索入口 ---------------- */
  function search(q, lang) {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    var idx = state.idx[lang]
    if (!idx) return { termResults: [], pageResults: [], ms: 0 }
    q = q.trim()
    if (!q) return { termResults: [], pageResults: [], ms: 0 }

    var groups = q.split('|').map(function (g) { return g.trim() }).filter(Boolean)
    if (!groups.length) return { termResults: [], pageResults: [], ms: 0 }

    var groupTokens = groups.map(tokenizeQuery).filter(function (t) { return t.length })

    var merged = Object.create(null)
    var g
    for (g = 0; g < groupTokens.length; g++) {
      var gr = matchGroup(idx, groupTokens[g])
      if (!gr) continue
      for (var i = 0; i < gr.length; i++) {
        var item = gr[i]
        var id = 'e' + item.entry.pi + '_' + item.entry.si
        var prev = merged[id]
        if (!prev || item.score > prev.score) {
          merged[id] = { entry: item.entry, score: item.score, ranges: item.ranges }
        }
      }
    }

    var entries = []
    for (var k in merged) {
      if (Object.prototype.hasOwnProperty.call(merged, k)) entries.push(merged[k])
    }
    entries.sort(function (a, b) { return b.score - a.score })

    var termResults = []
    if (groupTokens.length === 1 && groupTokens[0].length === 1) {
      var token = groupTokens[0][0]
      var scored = []
      var exactTe = idx.termByName[token.norm]
      if (exactTe) {
        var exactScore = tokenScoreTerm(exactTe, token)
        if (exactScore) scored.push({ te: exactTe, score: exactScore })
      }
      for (var ti = 0; ti < idx.terms.length; ti++) {
        var te = idx.terms[ti]
        if (te.name.toLowerCase() === token.norm) continue
        var s = tokenScoreTerm(te, token)
        if (s) scored.push({ te: te, score: s })
      }
      scored.sort(function (a, b) { return b.score - a.score })
      scored = scored.slice(0, 40)
      for (i = 0; i < scored.length; i++) {
        termResults.push({ te: scored[i].te, score: scored[i].score, kind: scored[i].te.kind, alias: scored[i].te.alias })
      }
    }

    var pageMap = Object.create(null)
    for (i = 0; i < entries.length; i++) {
      var e = entries[i]
      var pi = e.entry.pi
      var rec = pageMap[pi]
      if (!rec) rec = pageMap[pi] = { page: e.entry.page, secs: [] }
      if (rec.secs.length < 3) {
        rec.secs.push({ sec: e.entry.sec, score: e.score, ranges: e.ranges })
      }
    }
    var pageResults = []
    for (var pk in pageMap) {
      if (!Object.prototype.hasOwnProperty.call(pageMap, pk)) continue
      var pr = pageMap[pk]
      pr.best = pr.secs[0] ? pr.secs[0].score : 0
      pageResults.push(pr)
    }
    pageResults.sort(function (a, b) { return b.best - a.best })
    pageResults = pageResults.slice(0, 70)

    var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    return { termResults: termResults, pageResults: pageResults, ms: Math.max(1, Math.round(t1 - t0)) }
  }

  /* ---------------- 代码高亮（Ren'Py / Python）与复制 ---------------- */
  var PY_KW = 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' ')
  var RENPY_KW = ('define default init python early hide screen label menu return call jump if elif else while for in with at transform image style translate say window nvl centered extend voice scene show play queue stop pause pass and or not is from import as def class break continue try except finally raise global nonlocal lambda yield assert del on action contains use transclude block time true false textbutton imagebutton text key timer bar vbar hbox vbox grid fixed frame window viewport side drag draggable droppable drag_group imagemap hotspot hotbar ground insensitive mousearea null input button add has modal tag zorder variant predict roll_forward sensitive event music sound audio replaced replace behind onlayer layer end while').split(' ')
  var PY_BUILTIN = 'abs all any bin bool bytes callable chr classmethod compile complex delattr dict dir divmod enumerate eval exec filter float format frozenset getattr globals hasattr hash help hex id input int isinstance issubclass iter len list locals map max memoryview min next object oct open ord pow print property range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip self cls None True False'.split(' ')
  var RENPY_BUILTIN = ('renpy config store persistent gui Character DynamicCharacter Say Transform Sprite Movie ATL dissolve fade pixellate move ease easein easeout easeinleft easeinright easeintop easeinbottom easeoutleft easeoutright easeouttop easeoutbottom moveinleft moveinright moveintop moveinbottom moveoutleft moveoutright moveouttop moveoutbottom zoomin zoomout zoominout vpunch hpunch blinds squares wipeleft wiperight wipeup wipedown slideleft slideright slideup slidedown slideawayleft slideawayright slideawayup slideawaydown pushleft pushright pushup pushdown irisin irisout ImageDissolve AlphaDissolve CropMove PushMove ComposeTransition MultipleTransition DictTransitions notify screenshot quit restart fullscreen end_game error say input jump_out_of_context call_in_new_context invoke_in_new_context smoothstep linear None True False true false').split(' ')
  var RENPY_PROP = ('pos xpos ypos anchor xanchor yanchor align xalign yalign offset xoffset yoffset size xsize ysize area width height color text_color background padding margin spacing first_indent line_spacing xfill yfill fit xfit yfit min_width min_height xminimum yminimum xmaximum ymaximum minimum layout subtitle bold italic underline strikethrough font kerning size_group text_align layout_native line_overlap_split xcenter ycenter zoom rotate alpha additive nearest matrixcolor shader crop corner_radii foreground idle hover insensitive selected insensitive_child action activate_sound alternate style_text style_prefix focus_mask keyboard_focus tooltip scope at on if horizontal vertical xpadding ypadding first_spacing box_layout box_wrap box_wrap_spacing order_reverse child children adjust_spacing antialias black_color cursor debug drop_shadow hover_background hyperlink_functions idle_color insensitive_background justify language line_leading newline_indent outlines parent rest_indent ruby_style selected_color selected_background slow_abortable slow_cps slow_cps_multiplier text_y_fudge angle around crop_relative delay events rotate_pad subpixel tile xanchor xoffset warper start end who_color what_color cps ctc ctc_pause ctc_position who_prefix who_suffix what_prefix what_suffix window_background window_left_padding window_right_padding window_top_padding window_bottom_padding window_xpos window_ypos window_xanchor window_yanchor window_xalign window_yalign window_xfill window_yfill window_xsize window_ysize window_xminimum window_yminimum window_xmaximum window_ymaximum range value adjustment changed hovered unhovered fadein fadeout loop noloop').split(' ')
  var HL = { ready: false, pyKw: null, rpyKw: null, pyBuiltin: null, rpyBuiltin: null, prop: null, lblPrev: null }
  var LBL_PREV = 'label screen transform style init translate with at behind onlayer as play queue stop music sound audio voice call jump show scene hide image define'.split(' ')
  function hlSets() {
    if (HL.ready) return
    HL.ready = true
    function setOf(list) { var s = Object.create(null); for (var i = 0; i < list.length; i++) s[list[i]] = 1; return s }
    HL.pyKw = setOf(PY_KW)
    HL.rpyKw = setOf(RENPY_KW)
    HL.pyBuiltin = setOf(PY_BUILTIN)
    HL.rpyBuiltin = setOf(RENPY_BUILTIN)
    HL.prop = setOf(RENPY_PROP)
    HL.lblPrev = setOf(LBL_PREV)
  }
  function codeRegex() {
    return /(#[^\n]*)|([rRuUbBfF]{0,2}"""[\s\S]*?"""|[rRuUbBfF]{0,2}'''[\s\S]*?''')|([rRuUbBfF]{0,2}"(?:[^"\\\n]|\\.)*"|[rRuUbBfF]{0,2}'(?:[^'\\\n]|\\.)*')|(@[A-Za-z_]\w*)|(\b0[xX][0-9a-fA-F]+\b|\b0[bB][01]+\b|\b\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_]\w*(?=\s*\())|((?:\*\*|==|!=|<=|>=|->|=>|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\/\/))|([+\-*/%<>=!&|^~:])|(\$)|(\b[A-Za-z_]\w*\b)/g
  }
  function highlightCode(src, lang) {
    hlSets()
    var isPy = lang === 'python'
    var kw = isPy ? HL.pyKw : HL.rpyKw
    var builtin = isPy ? HL.pyBuiltin : HL.rpyBuiltin
    var out = ''
    var pos = 0
    var re = codeRegex()
    var prevWord = ''
    var m
    while ((m = re.exec(src))) {
      out += esc(src.slice(pos, m.index))
      var token = m[0]
      var cls = null
      var ch = token.charAt(0)
      if (ch === '#') cls = 'com'
      else if (ch === '"' || ch === "'") cls = 'str'
      else if ((ch === 'r' || ch === 'R' || ch === 'u' || ch === 'U' || ch === 'b' || ch === 'B' || ch === 'f' || ch === 'F') && (token.charAt(1) === '"' || token.charAt(1) === "'")) cls = 'str'
      else if (ch === '@') cls = 'dec'
      else if (/^[0-9]/.test(token)) cls = 'num'
      else if (ch === '$') cls = 'kw'
      else if (/^[A-Za-z_]/.test(token)) {
        if (kw[token]) cls = 'kw'
        else if (builtin[token]) cls = 'builtin'
        else if (HL.lblPrev[prevWord]) cls = 'lbl'
        else if (!isPy && HL.prop[token]) cls = 'prop'
        else if (m[6] !== undefined) cls = 'fn'
        prevWord = token
      } else {
        cls = 'op'
      }
      out += cls ? '<span class="tok-' + cls + '">' + esc(token) + '</span>' : esc(token)
      pos = re.lastIndex
    }
    out += esc(src.slice(pos))
    return out
  }

  function copyText(text, msg) {
    var fallback = function () {
      try {
        var ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        toast(msg || '已复制')
      } catch (e2) {
        toast('复制失败，请手动选择复制', 3000)
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(msg || '已复制') }, fallback)
    } else {
      fallback()
    }
  }

  function addCopyButton(pre) {
    /* 复制按钮不能放进 pre 里：pre 是 overflow-x:auto 的滚动容器，
       绝对定位的子元素会跟着代码一起横向滚走。所以外面套一层 .code-wrap，
       按钮挂到包裹层上，相对包裹层定位，代码滚动时按钮原地不动。 */
    var wrap = pre.parentNode
    if (!wrap || !wrap.classList || !wrap.classList.contains('code-wrap')) {
      wrap = document.createElement('div')
      wrap.className = 'code-wrap'
      if (pre.parentNode) pre.parentNode.insertBefore(wrap, pre)
      wrap.appendChild(pre)
    }
    if (wrap.querySelector('.code-copy')) return
    var btn = document.createElement('button')
    btn.className = 'code-copy'
    btn.innerHTML = iconRef('copy')
    btn.title = '复制代码'
    btn.addEventListener('click', function (e) {
      e.stopPropagation()
      copyText(pre.textContent, '代码已复制')
    })
    wrap.appendChild(btn)
  }

  /* 语言自动判断：renpy 块里若为纯 Python 代码则用 python 高亮 */
  function guessCodeLang(code, declared) {
    if (declared && declared !== 'renpy') return declared
    var hasRenpy = /^[ \t]*(label|screen|define|default|image|transform|style|init|menu|call|jump|show|hide|scene|play|voice|with|at|say|window|nvl)[ \t:($]/m.test(code)
    if (!hasRenpy && /^[ \t]*(def |class |import |from |try:|if __name__|#!.*python)/m.test(code)) return 'python'
    return 'renpy'
  }

  /* 文档图片：多路径探测（打包目录 / docs_cache / 原始文档目录），失败显示占位 */
  var remoteImgBudget = 40
  function resolveDocImages(container) {
    var imgs = container.querySelectorAll('img[data-docimg]')
    imgs.forEach(function (img) {
      if (img.getAttribute('data-resolved') === '1') return
      img.setAttribute('data-resolved', '1')
      var key = img.getAttribute('data-docimg') || ''
      var isEn = key.indexOf('en/') === 0
      var rest = key.replace(/^(zh|en)\//, '')
      var base = rest.split('/').pop()
      var noOshs = rest.replace(/^oshs\/game\//, '')
      var cands = []
      if (isEn) {
        cands.push('docs_cache/en/' + base)
        cands.push('assets/docimg/en/' + base)
        cands.push('../renpy_en/_images/' + base)
        cands.push('../renpy_en/_images/' + rest)
        cands.push('assets/docimg/en/' + rest)
        cands.push('https://www.renpy.org/doc/html/_images/' + base)
      } else {
        /* 本地：打包目录 → 已同步缓存 → 原始文档目录 */
        cands.push('assets/docimg/zh/' + rest)
        cands.push('docs_cache/zh/source/' + rest)
        cands.push('../renpy_cn/source/' + rest)
        cands.push('assets/docimg/zh/' + noOshs)
        cands.push('docs_cache/zh/source/' + noOshs)
        cands.push('../renpy_cn/source/' + noOshs)
        /* 跨语言同名兜底（例如 gui/borders1.png 只存在于英文 _images） */
        cands.push('assets/docimg/zh/' + base)
        cands.push('docs_cache/en/' + base)
        cands.push('assets/docimg/en/' + base)
        cands.push('../renpy_en/_images/' + base)
        /* 在线兜底：Ren'Py 官方文档图 / SDK GUI 模板图 / Gitee 原始文档 */
        cands.push('https://www.renpy.org/doc/html/_images/' + base)
        cands.push('https://cdn.jsdelivr.net/gh/renpy/renpy@master/gui/game/' + noOshs)
        cands.push('https://raw.githubusercontent.com/renpy/renpy/master/gui/game/' + noOshs)
        cands.push('https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/source/' + rest)
        cands.push('https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/' + rest)
      }
      var w = img.getAttribute('data-width')
      if (w) {
        img.style.maxWidth = /^\d+$/.test(w) ? w + 'px' : w
      }
      var idx = 0
      function tryNext() {
        if (idx >= cands.length) {
          var ph = document.createElement('span')
          ph.className = 'doc-img-missing'
          ph.innerHTML = iconRef('description') + '<span>图片未随文档附带：<code>' + esc(rest) +
            '</code>（已尝试本地缓存与在线源；可运行 更新文档.bat 或 复制文档图片.bat 补齐）</span>'
          if (img.parentNode) img.parentNode.replaceChild(ph, img)
          return
        }
        var src = cands[idx++]
        if (/^https?:/i.test(src)) {
          if (remoteImgBudget <= 0) { tryNext(); return }
          remoteImgBudget--
        }
        var probe = new Image()
        probe.onload = function () {
          img.src = src
          img.classList.add('doc-img-ok')
        }
        probe.onerror = tryNext
        probe.src = src
      }
      tryNext()
    })
  }

  /* 文档容器增强：pre 高亮 + 复制按钮；内联 code 点击复制 */
  function applyDocEnhance(container) {
    resolveDocImages(container)
    var pres = container.querySelectorAll('pre')
    pres.forEach(function (pre) {
      if (pre.getAttribute('data-hl') === '1') return
      pre.setAttribute('data-hl', '1')
      var lang = guessCodeLang(pre.textContent, pre.getAttribute('data-lang') || 'renpy')
      if (lang !== 'text') {
        pre.innerHTML = highlightCode(pre.textContent, lang)
      }
      addCopyButton(pre)
    })
    var codes = container.querySelectorAll('code')
    codes.forEach(function (c) {
      if (c.closest('pre') || c.closest('.result-card')) return
      c.classList.add('copyable')
      c.title = '点击复制'
    })
  }

  /* ---------------- 高亮与摘要 ---------------- */
  function collectRanges(text, tokens) {
    var ranges = []
    for (var t = 0; t < tokens.length; t++) {
      var token = tokens[t]
      if (token.cjk && token.cjkChars) {
        var cs = token.cjkChars
        if (cs.length === 1) {
          var idx0 = 0
          while (idx0 < text.length) {
            var p = text.indexOf(cs, idx0)
            if (p === -1) break
            ranges.push([p, p + 1])
            idx0 = p + 1
          }
        } else if (text.indexOf(cs) !== -1) {
          var idx2 = 0
          while (idx2 < text.length) {
            var p2 = text.indexOf(cs, idx2)
            if (p2 === -1) break
            ranges.push([p2, p2 + cs.length])
            idx2 = p2 + 1
          }
        } else {
          var seq = subseqPositions(text, cs)
          if (seq) {
            for (var s2 = 0; s2 < seq.length; s2++) ranges.push([seq[s2], seq[s2] + 1])
          }
        }
      } else if (!token.isPhrase) {
        var re = null
        try { re = new RegExp('\\b' + regexEscape(token.norm) + '\\b', 'gi') } catch (e) { re = null }
        var m, found = false
        if (re) {
          while ((m = re.exec(text))) { ranges.push([m.index, m.index + m[0].length]); found = true }
        }
        if (!found && token.norm) {
          var idx3 = 0
          var lower = text.toLowerCase()
          var q3 = token.norm.toLowerCase()
          while (idx3 < text.length) {
            var p3 = lower.indexOf(q3, idx3)
            if (p3 === -1) break
            ranges.push([p3, p3 + q3.length])
            idx3 = p3 + 1
          }
        }
      } else if (token.isPhrase) {
        var idx4 = 0
        var lower4 = text.toLowerCase()
        var q4 = token.norm.toLowerCase()
        while (idx4 < text.length) {
          var p4 = lower4.indexOf(q4, idx4)
          if (p4 === -1) break
          ranges.push([p4, p4 + q4.length])
          idx4 = p4 + 1
        }
      }
    }
    ranges.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] })
    var merged = []
    for (var i = 0; i < ranges.length; i++) {
      var r = ranges[i]
      var lastM = merged[merged.length - 1]
      if (lastM && r[0] <= lastM[1] + 1) {
        if (r[1] > lastM[1]) lastM[1] = r[1]
      } else {
        merged.push([r[0], r[1]])
      }
    }
    return merged
  }

  function highlight(text, tokens) {
    var ranges = collectRanges(text, tokens)
    if (!ranges.length) return esc(text)
    var out = ''
    var pos = 0
    for (var i = 0; i < ranges.length; i++) {
      var r = ranges[i]
      if (r[0] < pos) continue
      out += esc(text.slice(pos, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>'
      pos = r[1]
    }
    out += esc(text.slice(pos))
    return out
  }

  function makeSnippet(text, tokens) {
    text = normalizeWs(text)
    var ranges = collectRanges(text, tokens)
    if (!ranges.length) {
      return esc(text.slice(0, 150)) + (text.length > 150 ? '…' : '')
    }
    var r0 = ranges[0]
    var start = Math.max(0, r0[0] - 34)
    var end = Math.min(text.length, Math.max(r0[1] + 80, start + 60))
    if (start > 0) {
      var sp = text.indexOf(' ', start)
      if (sp !== -1 && sp < r0[0]) start = sp + 1
    }
    if (end < text.length) {
      var sp2 = text.lastIndexOf(' ', end)
      if (sp2 !== -1 && sp2 > r0[1]) end = sp2
    }
    var win = text.slice(start, end)
    return (start > 0 ? '…' : '') + highlight(win, tokens) + (end < text.length ? '…' : '')
  }

  /* ---------------- 结果渲染 ---------------- */
  var KIND_LABEL = {
    function: '函数', class: '类', method: '方法', attribute: '属性', property: '属性',
    var: '变量', data: '数据', define: '定义', default: '默认值',
    label: '标签', exception: '异常', enum: '枚举', api: 'API',
    'transform-property': '变换特性', 'style-property': '样式特性', 'screen-property': '界面特性',
    'text-tag': '文本标签', envvar: '环境变量', option: '选项', describe: '说明'
  }
  var FILTERS = [
    { id: 'all', label: '全部' },
    { id: 'api', label: 'API 条目' },
    { id: 'var', label: '变量' },
    { id: 'label', label: '标签' },
    { id: 'text', label: '正文' }
  ]

  function groupOfKind(kind) {
    if (!kind) return 'api'
    if (kind === 'var' || kind === 'data' || kind === 'define' || kind === 'default' || kind === 'envvar' || kind === 'option') return 'var'
    if (kind === 'label') return 'label'
    if (kind === 'api' || kind === 'function' || kind === 'class' || kind === 'method' || kind === 'attribute' ||
        kind === 'property' || kind === 'exception' || kind === 'enum' ||
        kind === 'transform-property' || kind === 'style-property' || kind === 'screen-property' ||
        kind === 'text-tag' || kind === 'describe') return 'api'
    return 'text'
  }

  function renderFilterChips() {
    var html = ''
    for (var i = 0; i < FILTERS.length; i++) {
      var f = FILTERS[i]
      html += '<button class="chip' + (state.filter === f.id ? ' active' : '') + '" data-filter="' + f.id + '">' + esc(f.label) + '</button>'
    }
    els.filterChips.innerHTML = html
    els.filterChips.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () {
        state.filter = b.getAttribute('data-filter')
        renderFilterChips()
        if (state.query) renderResults(state.results)
      })
    })
  }

  function showView(name) {
    state.mode = name
    els.viewHome.hidden = name !== 'home'
    els.viewResults.hidden = name !== 'results'
    els.viewPage.hidden = name !== 'page'
    var onPage = name === 'page'
    els.topSource.disabled = !onPage
    els.topSource.title = onPage ? '打开当前页在线原文' : '打开当前页在线原文（请先打开一个文档页面）'
    if (els.scroller) els.scroller.scrollTop = 0
    else window.scrollTo(0, 0)
  }

  function renderResults(res) {
    state.results = res || { termResults: [], pageResults: [], ms: 0 }
    var terms = state.results.termResults || []
    var pages = state.results.pageResults || []
    var shownTerms = terms.filter(function (t) {
      if (state.filter === 'all') return true
      return groupOfKind(t.kind) === state.filter
    })
    var shownPages = pages
    if (state.filter === 'api' || state.filter === 'var' || state.filter === 'label') shownPages = []

    var html = ''
    var total = shownTerms.length + shownPages.length

    var i
    for (i = 0; i < shownTerms.length; i++) {
      var tr = shownTerms[i]
      var kindLabel = KIND_LABEL[tr.kind] || 'API'
      var page = tr.te.page
      html += '<div class="result-card" tabindex="0" role="button" data-slug="' + esc(page.slug) + '" data-anchor="' + esc(tr.te.term.id || '') + '">'
      html += '<div class="result-head"><span class="kind-badge k-' + esc(tr.kind) + (tr.alias ? ' k-alias' : '') + '">' + esc(kindLabel) + (tr.alias ? ' · EN' : '') + '</span>'
      html += '<span class="result-title"><code>' + esc(tr.te.name) + '</code></span></div>'
      html += '<div class="result-bread">' + esc(page.title) + ' <span class="sep">›</span> <code>' + esc(tr.te.term.id || tr.te.name) + '</code></div>'
      html += '<div class="result-foot"><span>API 词条命中</span><span class="go">查看定义 ' + iconRef('chevron') + '</span></div>'
      html += '</div>'
    }

    for (i = 0; i < shownPages.length; i++) {
      var pr = shownPages[i]
      for (var s = 0; s < pr.secs.length; s++) {
        var secR = pr.secs[s]
        var snippet = makeSnippet(secR.sec.text || '', state.lastTokens || [])
        html += '<div class="result-card" tabindex="0" role="button" data-slug="' + esc(pr.page.slug) + '" data-anchor="' + esc(secR.sec.id || '') + '">'
        html += '<div class="result-head"><span class="kind-badge k-page">章节</span>'
        html += '<span class="result-title">' + esc(pr.page.title) + '</span></div>'
        html += '<div class="result-bread">' + esc(pr.page.title) + ' <span class="sep">›</span> ' + esc(secR.sec.title || '') + '</div>'
        html += '<div class="result-snippet">' + snippet + '</div>'
        html += '<div class="result-foot"><span>相关度 ' + Math.round(Math.min(99, secR.score)) + '</span><span class="go">查看 ' + iconRef('chevron') + '</span></div>'
        html += '</div>'
      }
    }

    els.resultsList.innerHTML = html
    els.resultsCount.textContent = '共 ' + total + ' 条结果 · ' + (state.results.ms || 0) + ' ms · ' + (state.lang === 'zh' ? '中文' : 'EN') + ' 索引'
    els.emptyState.hidden = total > 0
    state.selected = total > 0 ? 0 : -1
    applySelection()

    els.resultsList.querySelectorAll('.result-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var slug = card.getAttribute('data-slug')
        var anchor = card.getAttribute('data-anchor')
        if (slug) openPage(slug, state.lang, anchor, true)
      })
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var slug2 = card.getAttribute('data-slug')
          var anchor2 = card.getAttribute('data-anchor')
          if (slug2) openPage(slug2, state.lang, anchor2, true)
        }
      })
    })
  }

  function applySelection() {
    var cards = els.resultsList.querySelectorAll('.result-card')
    cards.forEach(function (c, i) {
      c.classList.toggle('selected', i === state.selected)
    })
    if (state.selected >= 0 && cards[state.selected]) {
      var card = cards[state.selected]
      if (card.scrollIntoView) card.scrollIntoView({ block: 'nearest' })
    }
  }

  function moveSelection(delta) {
    var cards = els.resultsList.querySelectorAll('.result-card')
    if (!cards.length) return
    state.selected = Math.max(0, Math.min(cards.length - 1, state.selected + delta))
    applySelection()
  }

  function openSelected() {
    var cards = els.resultsList.querySelectorAll('.result-card')
    var card = cards[state.selected] || cards[0]
    if (card) {
      var slug = card.getAttribute('data-slug')
      var anchor = card.getAttribute('data-anchor')
      if (slug) openPage(slug, state.lang, anchor, true)
    }
  }

  function runSearch() {
    var q = els.searchInput.value
    state.query = q
    els.searchClear.hidden = !q
    if (!q.trim()) {
      state.results = null
      goHome()
      return
    }
    if (!state.idx[state.lang]) {
      /* 索引层数据未加载时先取数据；数据已在本地则直接建索引后继续 */
      if (!state.data[state.lang]) {
        ensureLang(state.lang).then(function () {
          if (els.searchInput.value.trim()) runSearch()
        }).catch(function () {})
        return
      }
      ensureIndex(state.lang)
      if (!state.idx[state.lang]) return
    }
    var tokens = tokenizeQuery(q)
    state.lastTokens = tokens
    var res = search(q, state.lang)
    state.baseMode = 'results'
    showView('results')
    renderResults(res)
  }

  /* ---------------- 页面打开与导航 ---------------- */
  function pageOf(lang, slug) {
    var idx = state.idx[lang]
    if (idx) return idx.bySlug[slug] ? idx.bySlug[slug] : null
    /* 搜索索引尚未构建时回退到数据层，避免首屏找不到页面 */
    var map = state.pageMap[lang]
    return map && map[slug] ? map[slug] : null
  }

  function openPage(slug, lang, anchor, push) {
    var page = pageOf(lang, slug)
    if (!page) {
      /* 回退到另一语言 */
      var other = lang === 'zh' ? 'en' : 'zh'
      var page2 = pageOf(other, slug)
      if (page2) {
        ensureLang(other).then(function () {
          openPage(slug, other, anchor, push)
        }).catch(function () {})
        return
      }
      toast('未找到页面：' + esc(slug), 3200)
      return
    }
    /* 正文层按需加载：首次打开文档页时才取 HTML */
    if (!page.html) {
      setProgress(true, 30)
      ensurePages(lang).then(function () {
        setProgress(false)
        openPage(slug, lang, anchor, push)
      }).catch(function (err) {
        setProgress(false)
        toast('正文加载失败：' + esc(err && err.message ? err.message : err), 5000)
      })
      return
    }
    if (push) {
      if (state.current) state.stack.push({ slug: state.current.slug, lang: state.current.lang, anchor: state.current.anchor || null })
      state.baseMode = state.mode === 'results' ? 'results' : state.baseMode
    }
    state.current = { slug: slug, lang: lang, anchor: anchor || null }
    renderPage(page, lang, anchor)
    highlightSidebarActive(slug)
    closeSidebarMobile()
  }

  function renderPage(page, lang, anchor) {
    if (!page.html) {
      /* 正文层按需加载（语言切换、返回上一页等入口统一走这里） */
      setProgress(true, 30)
      ensurePages(lang).then(function () {
        setProgress(false)
        renderPage(page, lang, anchor)
      }).catch(function (err) {
        setProgress(false)
        toast('正文加载失败：' + esc(err && err.message ? err.message : err), 5000)
      })
      return
    }
    showView('page')
    els.pageTitle.innerHTML = '<span class="lang-tag">' + esc(lang === 'zh' ? '中文' : 'EN') + '</span>' + esc(page.title)
    els.pageBack.style.visibility = (state.stack.length || state.baseMode === 'results') ? 'visible' : 'hidden'

    var tocHtml = ''
    var secs = (page.sections || []).slice(0, 42)
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i]
      if (s.id) tocHtml += '<button class="toc-chip" data-anchor="' + esc(s.id) + '" title="' + esc(s.title || '') + '">' + esc(s.title || s.id) + '</button>'
    }
    els.pageToc.innerHTML = tocHtml
    els.pageToc.querySelectorAll('.toc-chip').forEach(function (c) {
      c.addEventListener('click', function () {
        /* 立即高亮被点击的芯片，滚动结束后再按位置校正 */
        els.pageToc.querySelectorAll('.toc-chip').forEach(function (o) { o.classList.toggle('active', o === c) })
        if (c.scrollIntoView) {
          try { c.scrollIntoView({ block: 'nearest', inline: 'center' }) } catch (e) { /* ignore */ }
        }
        scrollToAnchor(c.getAttribute('data-anchor'))
      })
    })

    var navHtml = buildPageNav(lang, page.slug)
    els.pageBody.innerHTML = '<div class="doc-body">' + page.html + '</div>' + navHtml
    applyDocEnhance(els.pageBody)
    setTimeout(updateActiveToc, 0)
    els.pageBody.querySelectorAll('.nav-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        openPage(b.getAttribute('data-nav-slug'), lang, null, true)
      })
    })
    window.scrollTo({ top: 0 })
    if (anchor) {
      setTimeout(function () { scrollToAnchor(anchor) }, 60)
    }
  }

  /* 原版式上一页/下一页 */
  function navFlatList(lang) {
    var out = []
    var nav = META && META.nav ? META.nav[lang] : null
    var groups = (nav && nav.groups ? nav.groups : []).concat()
    var extras = (nav && nav.extras ? nav.extras : []).concat()
    if (extras.length) groups.push({ caption: 'extras', items: extras })
    for (var g = 0; g < groups.length; g++) {
      var items = groups[g].items || []
      for (var i = 0; i < items.length; i++) out.push(items[i].slug)
    }
    return out
  }

  function buildPageNav(lang, slug) {
    var flat = navFlatList(lang)
    var idx = flat.indexOf(slug)
    if (idx === -1) return ''
    var prev = idx > 0 ? flat[idx - 1] : null
    var next = idx < flat.length - 1 ? flat[idx + 1] : null
    if (!prev && !next) return ''
    var html = '<div class="page-nav">'
    if (prev) {
      html += '<button class="nav-btn" data-nav-slug="' + esc(prev) + '">'
      html += '<span class="nav-arrow">‹</span><span class="nav-label">上一页</span>'
      html += '<span class="nav-title">' + esc(pageTitleFor(lang, prev)) + '</span></button>'
    } else {
      html += '<span class="nav-spacer"></span>'
    }
    if (next) {
      html += '<button class="nav-btn next" data-nav-slug="' + esc(next) + '">'
      html += '<span class="nav-title">' + esc(pageTitleFor(lang, next)) + '</span>'
      html += '<span class="nav-label">下一页</span><span class="nav-arrow">›</span></button>'
    }
    html += '</div>'
    return html
  }

  function goHome() {
    state.baseMode = 'home'
    state.current = null
    state.stack = []
    showView('home')
    highlightSidebarActive(null)
    renderHome()
  }

  function renderHome(retried) {
    var page = pageOf(state.lang, 'index')
    if (!page) {
      if (retried) {
        els.viewHome.innerHTML = '<div class="doc-body"><p>首页数据缺失（index 页面不存在），请重新构建索引。</p></div>'
        return
      }
      els.viewHome.innerHTML = '<div class="doc-body"><p>正在加载…</p></div>'
      ensureLang(state.lang).then(function () { renderHome(true) }).catch(function () {})
      return
    }
    if (!page.html && !state.pagesLoaded[state.lang]) {
      els.viewHome.innerHTML = '<div class="doc-body"><p>正在加载…</p></div>'
      ensurePages(state.lang).then(function () { renderHome(true) }).catch(function () {})
      return
    }
    els.viewHome.innerHTML = '<div class="doc-body">' + page.html + '</div>'
    applyDocEnhance(els.viewHome)
  }

  function pageBack() {
    if (state.stack.length) {
      var prev = state.stack.pop()
      var page = pageOf(prev.lang, prev.slug)
      if (page) {
        state.current = { slug: prev.slug, lang: prev.lang, anchor: prev.anchor || null }
        renderPage(page, prev.lang, prev.anchor || null)
        highlightSidebarActive(prev.slug)
        return
      }
    }
    if (state.baseMode === 'results' && state.query.trim()) {
      showView('results')
      return
    }
    goHome()
  }

  function cssEscapeAttr(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }

  /* 吸顶栏总高度（顶栏 + 文章页标题栏 + 章节栏），用于锚点跳转偏移 */
  function stickyOffset() {
    var h = 0
    var head = document.querySelector('.page-head')
    if (head && head.offsetHeight && state.mode === 'page') h += head.offsetHeight
    var toc = document.querySelector('.page-toc')
    if (toc && toc.offsetHeight && state.mode === 'page') h += toc.offsetHeight
    return h + 16
  }

  var tocJumpActive = false

  /* 可控平滑滚动：滚完再回调（便于滚动结束后再播放高亮） */
  function smoothScrollTo(top, done) {
    var finish = function () { tocJumpActive = false; done() }
    tocJumpActive = true
    var sc = els.scroller
    var reduce = false
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch (e) { reduce = false }
    if (!sc) {
      try { window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' }) } catch (e) { window.scrollTo(0, top) }
      setTimeout(finish, reduce ? 0 : 300)
      return
    }
    var start = sc.scrollTop
    var dist = top - start
    if (reduce || Math.abs(dist) < 2) {
      sc.scrollTop = top
      finish()
      return
    }
    var duration = Math.min(700, Math.max(240, Math.abs(dist) * 0.45))
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now()
    function step(now) {
      var p = Math.min(1, (now - t0) / duration)
      var eased = 1 - Math.pow(1 - p, 3)
      sc.scrollTop = start + dist * eased
      if (p < 1) requestAnimationFrame(step)
      else { sc.scrollTop = top; finish() }
    }
    requestAnimationFrame(step)
  }

  /* 播放定位高亮：标题只覆盖文字本身（内联包裹），其它元素整块淡染 */
  function flashElement(target) {
    if (!target) return
    var isHeading = /^H[1-6]$/.test(target.tagName || '')
    if (!isHeading) {
      target.classList.remove('flash-anchor')
      void target.offsetWidth
      target.classList.add('flash-anchor')
      return
    }
    /* 已有包裹则重复播放，避免再次嵌套 */
    var existing = target.querySelector(':scope > .flash-inline')
    if (existing) {
      existing.classList.remove('flash-anchor')
      void existing.offsetWidth
      existing.classList.add('flash-anchor')
      return
    }
    var span = document.createElement('span')
    span.className = 'flash-inline'
    while (target.firstChild) span.appendChild(target.firstChild)
    target.appendChild(span)
    void span.offsetWidth
    span.classList.add('flash-anchor')
    setTimeout(function () {
      if (span.parentNode === target) {
        while (span.firstChild) target.appendChild(span.firstChild)
        if (span.parentNode) span.parentNode.removeChild(span)
      }
    }, 2650)
  }

  /* 根据当前滚动位置高亮对应章节芯片
     判定线 = 文档区顶部 + 标题栏 + 章节栏 + 余量：
     跳转后目标标题正好停在“标题栏+章节栏”下方，若不含章节栏高度就会误判成上一个章节 */
  function updateActiveToc(force) {
    if (tocJumpActive && !force) return
    var chips = els.pageToc.querySelectorAll('.toc-chip')
    if (!chips.length || state.mode !== 'page') return
    var box = els.scroller ? els.scroller.getBoundingClientRect().top : 0
    var head = document.querySelector('.page-head')
    var tocH = (els.pageToc && els.pageToc.offsetHeight) ? els.pageToc.offsetHeight : 44
    var limit = box + ((head && head.offsetHeight) || 56) + tocH + 24
    var best = null
    for (var i = 0; i < chips.length; i++) {
      var id = chips[i].getAttribute('data-anchor')
      var el2 = els.pageBody.querySelector('[id="' + cssEscapeAttr(id) + '"]')
      if (!el2) continue
      if (el2.getBoundingClientRect().top <= limit) best = chips[i]
      else break
    }
    /* 滚到底部时，最后一节可能无法越过判定线，这里直接选中最后一个 */
    var sc = els.scroller
    if (sc && sc.scrollHeight - (sc.scrollTop + sc.clientHeight) <= 4) {
      best = chips[chips.length - 1]
    }
    for (var k = 0; k < chips.length; k++) chips[k].classList.toggle('active', chips[k] === best)
    if (best && best.scrollIntoView) {
      try { best.scrollIntoView({ block: 'nearest', inline: 'center' }) } catch (e) { /* ignore */ }
    }
  }

  function scrollToAnchor(anchor) {
    if (!anchor) return
    var body = state.mode === 'home' ? els.viewHome : els.pageBody
    var el2 = body.querySelector('[id="' + cssEscapeAttr(anchor) + '"]')
    if (el2) {
      /* 用吸顶栏高度做偏移，避免目标第一行被吸顶栏挡住 */
      var scroller = els.scroller
      var base = scroller ? scroller.getBoundingClientRect().top : 0
      var current = scroller ? scroller.scrollTop : (window.scrollY || window.pageYOffset || 0)
      var top = current + (el2.getBoundingClientRect().top - base) - stickyOffset()
      top = Math.max(0, Math.round(top))
      var target = el2.closest('dt, h1, h2, h3, h4, h5, h6') || el2
      /* 先滚动，滚动结束再播放高亮，保证用户真正看得到 */
      smoothScrollTo(top, function () {
        flashElement(target)
        updateActiveToc(true)
        clearTimeout(scrollToAnchor._t)
        scrollToAnchor._t = setTimeout(function () {
          body.querySelectorAll('.flash-anchor').forEach(function (n) { n.classList.remove('flash-anchor') })
        }, 2700)
      })
    } else {
      body.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function handleDocLink(href) {
    if (!href) return
    if (href.charAt(0) === '#') {
      scrollToAnchor(href.slice(1))
      return
    }
    if (href.indexOf('PAGE:') === 0) {
      var target = href.slice(5)
      var anchor = null
      var tm = target.match(/^(.*)<([^<>]+)>$/)
      if (tm) target = tm[2]
      var hash = target.indexOf('#')
      if (hash !== -1) { anchor = target.slice(hash + 1); target = target.slice(0, hash) }
      openPage(target, state.current ? state.current.lang : state.lang, anchor, true)
      return
    }
    if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
      openExternal(href)
      return
    }
    var m = href.match(/^([^#]*?)(?:#(.*))?$/)
    var slug = (m[1] || '').replace(/\.html$/, '').replace(/^\.\//, '')
    openPage(slug || (state.current ? state.current.slug : 'index'), state.current ? state.current.lang : state.lang, m[2] || null, true)
  }

  function openExternal(url) {
    var handled = false
    try {
      if (window.renpyDocUpdate && typeof window.renpyDocUpdate.openExternal === 'function') {
        window.renpyDocUpdate.openExternal(url)
        handled = true
      } else if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.open_external === 'function') {
        window.pywebview.api.open_external(url)
        handled = true
      }
    } catch (e) { handled = false }
    if (!handled) {
      try { window.open(url, '_blank') } catch (e2) { toast('无法打开链接：' + esc(url), 4000) }
    }
  }

  function pageOpenSource() {
    if (!state.current) return
    var url
    if (state.current.lang === 'zh') {
      url = 'https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/source/' + state.current.slug + '.rst'
    } else {
      url = 'https://www.renpy.org/doc/html/' + state.current.slug + '.html'
    }
    openExternal(url)
  }

  /* ---------------- 侧边目录（原版式） ---------------- */
  var collapsedGroups = {}

  function pageTitleFor(lang, slug) {
    var p = pageOf(lang, slug)
    if (p) return p.title
    var other = lang === 'zh' ? 'en' : 'zh'
    var p2 = pageOf(other, slug)
    return p2 ? p2.title : slug
  }

  function renderSidebar() {
    if (!META || !META.nav) return
    var nav = META.nav[state.lang] || {}
    var groups = Array.isArray(nav.groups) ? nav.groups.slice() : []
    var extras = Array.isArray(nav.extras) ? nav.extras.slice() : []
    if (extras.length) {
      groups.push({ caption: (state.lang === 'zh' ? '\u7d22\u5f15\u4e0e\u6837\u4f8b' : 'Indices'), items: extras, extras: true })
    }
    var filter = ''
    var html = ''
    var totalItems = 0
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g]
      var items = Array.isArray(group.items) ? group.items : []
      var itemsHtml = ''
      for (var i = 0; i < items.length; i++) {
        var item = items[i]
        var title = (item.title && item.title !== item.slug) ? item.title : pageTitleFor(state.lang, item.slug)
        if (filter && (title + ' ' + item.slug).toLowerCase().indexOf(filter) === -1) continue
        totalItems++
        var inLang = !!pageOf(state.lang, item.slug)
        var fallback = ''
        if (!inLang) {
          var other = state.lang === 'zh' ? 'en' : 'zh'
          if (pageOf(other, item.slug)) fallback = '<span class="n-fallback">' + (state.lang === 'zh' ? 'EN' : '中') + '</span>'
          else fallback = '<span class="n-fallback">—</span>'
        }
        var active = state.current && state.current.slug === item.slug ? ' active' : ''
        itemsHtml += '<button class="nav-item' + active + '" data-slug="' + esc(item.slug) + '">'
        itemsHtml += '<span class="n-title">' + esc(title) + '</span>' + fallback
        itemsHtml += '</button>'
      }
      if (!itemsHtml && filter) continue
      var collapsed = collapsedGroups[state.lang + ':' + g] ? ' collapsed' : ''
      html += '<div class="nav-group' + (group.extras ? ' nav-group-extras' : '') + collapsed + '" data-group="' + g + '">'
      html += '<button class="nav-caption">' + iconRef('expand-more') + '<span>' + esc(group.caption) + '</span></button>'
      html += '<div class="nav-items">' + itemsHtml + '</div>'
      html += '</div>'
    }
    if (!html) html = '<div class="nav-empty">目录为空</div>'
    els.sidebarNav.innerHTML = html
    els.sidebarCount.textContent = totalItems + ' 项'

    els.sidebarNav.querySelectorAll('.nav-caption').forEach(function (c) {
      c.addEventListener('click', function () {
        var grp = c.closest('.nav-group')
        grp.classList.toggle('collapsed')
        var gi = grp.getAttribute('data-group')
        collapsedGroups[state.lang + ':' + gi] = grp.classList.contains('collapsed')
      })
    })
    els.sidebarNav.querySelectorAll('.nav-item').forEach(function (it) {
      it.addEventListener('click', function () {
        openPage(it.getAttribute('data-slug'), state.lang, null, true)
      })
    })
    highlightSidebarActive(state.current ? state.current.slug : null)
  }

  function highlightSidebarActive(slug) {
    els.sidebarNav.querySelectorAll('.nav-item').forEach(function (it) {
      it.classList.toggle('active', slug != null && it.getAttribute('data-slug') === slug)
    })
  }

  var scrimTimer = null
  function openSidebarMobile() {
    if (window.matchMedia && !window.matchMedia('(max-width: 920px)').matches) return
    if (scrimTimer) { clearTimeout(scrimTimer); scrimTimer = null }
    els.sidebar.classList.add('open')
    els.scrim.hidden = false
    requestAnimationFrame(function () { els.scrim.classList.add('show') })
  }
  function closeSidebarMobile() {
    els.sidebar.classList.remove('open')
    els.scrim.classList.remove('show')
    if (scrimTimer) clearTimeout(scrimTimer)
    scrimTimer = setTimeout(function () { els.scrim.hidden = true; scrimTimer = null }, 220)
  }

  /* ---------------- 语言切换 ---------------- */
  function setLang(lang, skipToast) {
    if (state.lang === lang) return
    state.lang = lang
    store.set('lang', lang)
    updateLangSeg()
    renderSidebar()
    if (state.mode === 'page' && state.current) {
      var page = pageOf(lang, state.current.slug)
      if (page) {
        state.current = { slug: state.current.slug, lang: lang }
        renderPage(page, lang, null)
      } else {
        var other = lang === 'zh' ? 'en' : 'zh'
        var p2 = pageOf(other, state.current.slug)
        if (p2) {
          state.current = { slug: state.current.slug, lang: other }
          renderPage(p2, other, null)
          toast('当前页面暂无' + (lang === 'zh' ? '中文' : '英文') + '版，继续显示' + (other === 'zh' ? '中文' : '英文'), 3600)
        } else {
          goHome()
        }
      }
    } else if (state.mode === 'home') {
      renderHome()
    } else if (state.mode === 'results' && state.query.trim()) {
      runSearch()
    }
    renderStatus()
    if (!skipToast) toast('已切换为' + (lang === 'zh' ? '中文翻译文档' : '英文原版文档'))
  }
  function updateLangSeg() {
    els.langSeg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === state.lang)
    })
  }

  /* ---------------- 状态栏 ---------------- */
  function renderStatus() {
    if (!META) return
    var d = META.generated ? new Date(META.generated) : null
    els.statusZh.innerHTML = iconRef('check') + '中文 ' + esc(META.docZh.pages || 0) + ' 页'
    els.statusEn.innerHTML = iconRef('check') + '英文 ' + esc(META.docEn.pages || 0) + ' 页' + (META.docEn.version ? ' · v' + esc(META.docEn.version) : '')
    els.statusGenerated.textContent = d ? ('索引生成于 ' + d.toLocaleString()) : ''
  }

  /* ---------------- 更新检测 ---------------- */
  function checkUpdates(manual) {
    if (!META) return
    var status = els.statusUpdate
    status.classList.remove('has-update')
    els.btnUpdate.classList.add('spinning')
    status.innerHTML = iconRef('refresh') + '<span>正在检查更新…</span>'
    doUpdateCheck()
      .then(function (info) {
        els.btnUpdate.classList.remove('spinning')
        var zhOut = !!(info.zh && info.zh.date && new Date(info.zh.date).getTime() > new Date(META.generated).getTime())
        var enOut = !!(info.en && info.en.version && String(info.en.version) !== String(META.docEn.version))
        store.set('lastCheck', String(Date.now()))
        if (zhOut || enOut) {
          els.updateBadge.hidden = false
          status.classList.add('has-update')
          var parts = []
          if (zhOut) parts.push('中文文档有更新' + (info.zh.sha ? ' (' + String(info.zh.sha).slice(0, 7) + ')' : ''))
          if (enOut) parts.push('英文文档已更新到 v' + esc(info.en.version))
          status.innerHTML = iconRef('error') + '<span>' + esc(parts.join('；')) + ' — 点击查看详情</span>'
          showUpdateDialog(info)
        } else {
          els.updateBadge.hidden = true
          status.innerHTML = iconRef('cloud-done') + '<span>文档已是最新（' + (manual ? '手动检查' : '自动检查') + '）</span>'
        }
      })
      .catch(function (err) {
        els.btnUpdate.classList.remove('spinning')
        els.updateBadge.hidden = true
        status.innerHTML = iconRef('cloud-off') + '<span>无法检查更新：' + esc(err && err.message ? err.message : err) + '</span>'
        if (manual) toast('更新检查失败：' + esc(err && err.message ? err.message : err) + '。请确认网络，或使用桌面版（自带后台检查）。', 7000)
      })
  }

  /* ---------------- 更新询问对话框（主题同步） ---------------- */
  var updateDlg = null
  function hideUpdateDialog() {
    if (!updateDlg) return
    var d = updateDlg
    updateDlg = null
    d.classList.remove('show')
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d) }, 200)
  }
  function showUpdateDialog(info) {
    hideUpdateDialog()
    var zhOut = !!(info.zh && info.zh.date && new Date(info.zh.date).getTime() > new Date(META.generated).getTime())
    var enOut = !!(info.en && info.en.version && String(info.en.version) !== String(META.docEn.version))
    var lines = []
    if (zhOut) lines.push('中文翻译文档：Gitee 仓库有新提交' + (info.zh.sha ? '（' + esc(String(info.zh.sha).slice(0, 7)) + '）' : ''))
    if (enOut) lines.push('英文官方文档：已更新到 v' + esc(info.en.version) + '（本地为 v' + esc(META.docEn.version) + '）')
    var scrim = document.createElement('div')
    scrim.className = 'dlg-scrim'
    var html = '<div class="dialog" role="dialog" aria-modal="true">'
    html += '<div class="dialog-head">' + iconRef('cloud-done') + '<div class="dialog-title">检测到文档更新</div></div>'
    html += '<div class="dialog-text">' + lines.map(function (l) { return '<div>' + l + '</div>' }).join('') 
    html += '<div style="margin-top:10px">是否立即同步更新本地索引？同步会重新下载文档并重建搜索索引，完成后自动刷新。</div></div>'
    html += '<div class="dialog-status" id="dlgStatus"></div>'
    html += '<div class="dialog-actions">'
    html += '<button class="dlg-btn" data-act="later">稍后</button>'
    if (info.zh && info.zh.url) html += '<button class="dlg-btn tonal" data-act="commit">查看提交</button>'
    html += '<button class="dlg-btn filled" data-act="sync">立即同步</button>'
    html += '</div></div>'
    scrim.innerHTML = html
    document.body.appendChild(scrim)
    updateDlg = scrim
    requestAnimationFrame(function () { scrim.classList.add('show') })

    var statusEl = scrim.querySelector('#dlgStatus')
    var syncBtn = scrim.querySelector('[data-act="sync"]')
    scrim.querySelector('[data-act="later"]').addEventListener('click', hideUpdateDialog)
    var commitBtn = scrim.querySelector('[data-act="commit"]')
    if (commitBtn) {
      commitBtn.addEventListener('click', function () { openExternal(info.zh.url) })
    }
    syncBtn.addEventListener('click', function () {
      syncBtn.disabled = true
      syncBtn.textContent = '同步中…'
      statusEl.textContent = '正在下载最新文档并重建索引，请稍候…'
      setProgress(true, 40)
      syncDocs().then(function (res) {
        setProgress(false)
        if (res && res.ok && res.dataUrl) {
          statusEl.textContent = '同步完成，正在重新加载索引…'
          return reloadWithBase(res.dataUrl).then(function () { hideUpdateDialog() })
        }
        syncBtn.disabled = false
        syncBtn.textContent = '立即同步'
        var msg = (res && res.message) ? res.message : '同步失败，请稍后重试。'
        statusEl.textContent = msg
        if (res && res.reason === 'unsupported') {
          openExternal('https://gitee.com/kurororo666/Renpydoc-ranslate')
        }
      }).catch(function (err) {
        setProgress(false)
        syncBtn.disabled = false
        syncBtn.textContent = '立即同步'
        statusEl.textContent = '同步失败：' + esc(err && err.message ? err.message : err)
      })
    })
    scrim.addEventListener('click', function (e) {
      if (e.target === scrim) hideUpdateDialog()
    })
  }

  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')) }, ms)
      p.then(function (v) { clearTimeout(t); resolve(v) }, function (e) { clearTimeout(t); reject(e) })
    })
  }

  function doUpdateCheck() {
    var p = null
    try {
      if (window.renpyDocUpdate && typeof window.renpyDocUpdate.check === 'function') {
        p = Promise.resolve(window.renpyDocUpdate.check())
      } else if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.check === 'function') {
        p = Promise.resolve(window.pywebview.api.check())
      }
    } catch (e) { p = null }
    if (p) return withTimeout(p, 12000)
    return withTimeout(webCheck(), 9000)
  }

  function webCheck() {
    var zhP = Promise.resolve().then(function () {
      if (typeof fetch !== 'function') throw new Error('no-fetch')
      return fetch(META.update.giteeApi, { cache: 'no-store' })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status)
      return r.json()
    }).then(function (j) {
      var first = j && j.length ? j[0] : null
      if (!first) return { zh: null }
      var date = first.created_at || (first.commit && first.commit.committer && first.commit.committer.date) || ''
      return {
        zh: {
          date: date,
          sha: first.sha || '',
          url: first.html_url || 'https://gitee.com/kurororo666/Renpydoc-ranslate'
        }
      }
    }).catch(function () { return { zh: null } })

    var enP = Promise.resolve().then(function () {
      if (typeof fetch !== 'function') throw new Error('no-fetch')
      return fetch(META.update.enIndexUrl, { cache: 'no-store' })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status)
      return r.text()
    }).then(function (t) {
      var m = t.match(/([\d]+\.[\d]+(?:\.[\d]+)?)\s+Documentation/)
      return { en: { version: m ? m[1] : '' } }
    }).catch(function () { return { en: null } })

    return Promise.all([zhP, enP]).then(function (rs) {
      var zh = rs[0].zh
      var en = rs[1].en
      if (!zh && !en) throw new Error('网络不可用或浏览器跨域限制(file://)')
      return { zh: zh, en: en }
    })
  }

  /* ---------------- 右键快捷菜单 ---------------- */
  var ctxMenu = null
  function hideCtxMenu() {
    if (ctxMenu) { ctxMenu.remove(); ctxMenu = null }
  }
  function selectAllDoc(container) {
    try {
      var sel = window.getSelection()
      if (sel && container) {
        var range = document.createRange()
        range.selectNodeContents(container)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    } catch (e) { /* ignore */ }
  }
  function showCtxMenu(x, y, items) {
    hideCtxMenu()
    var menu = document.createElement('div')
    menu.className = 'ctx-menu'
    for (var i = 0; i < items.length; i++) {
      var b = document.createElement('button')
      b.className = 'ctx-item'
      b.innerHTML = iconRef(items[i].icon) + '<span>' + esc(items[i].label) + '</span>'
      ;(function (action) {
        b.addEventListener('click', function () { hideCtxMenu(); action() })
      })(items[i].action)
      menu.appendChild(b)
    }
    document.body.appendChild(menu)
    var mw = menu.offsetWidth || 200
    var mh = menu.offsetHeight || (items.length * 40 + 12)
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - mw - 8)) + 'px'
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - mh - 8)) + 'px'
    ctxMenu = menu
  }
  function onContextMenu(e) {
    var items = []
    var sel = ''
    try { sel = window.getSelection().toString() } catch (err) { sel = '' }
    var pre = e.target.closest ? e.target.closest('pre') : null
    var a = e.target.closest ? e.target.closest('a') : null
    var codeEl = e.target.closest ? e.target.closest('code.copyable') : null
    var docEl = e.target.closest ? e.target.closest('.doc-body') : null
    if (sel) {
      items.push({ label: '复制选中内容', icon: 'copy', action: function () { copyText(sel, '已复制') } })
    }
    if (pre) {
      items.push({ label: '复制整段代码', icon: 'copy', action: function () { copyText(pre.textContent, '代码已复制') } })
    }
    if (codeEl) {
      var t = String(codeEl.textContent || '')
      items.push({ label: '复制 ' + (t.length > 24 ? t.slice(0, 24) + '…' : t), icon: 'copy', action: function () { copyText(t, '已复制') } })
    }
    if (sel || docEl) {
      items.push({ label: '全选正文', icon: 'list', action: function () { selectAllDoc(docEl) } })
    }
    if (a && a.getAttribute('href')) {
      items.push({ label: '打开链接', icon: 'open-new', action: function () { handleDocLink(a.getAttribute('href')) } })
    }
    if (items.length) {
      e.preventDefault()
      showCtxMenu(e.clientX, e.clientY, items)
    } else {
      hideCtxMenu()
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    var debouncedSearch = debounce(runSearch, 60)
    els.searchInput.addEventListener('input', debouncedSearch)
    /* 已有搜索词时，再次点击/聚焦搜索框直接回到搜索结果视图 */
    els.searchInput.addEventListener('focus', function () {
      if (state.query.trim() && state.mode !== 'results') {
        state.baseMode = 'results'
        showView('results')
        if (state.results) renderResults(state.results)
        else runSearch()
      }
    })
    els.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (state.query.trim() && state.mode === 'results') moveSelection(e.key === 'ArrowDown' ? 1 : -1)
      } else if (e.key === 'Enter') {
        if (state.query.trim() && state.mode === 'results') openSelected()
      } else if (e.key === 'Escape') {
        els.searchInput.value = ''
        els.searchInput.blur()
        runSearch()
      }
    })
    els.searchClear.addEventListener('click', function () {
      els.searchInput.value = ''
      runSearch()
      els.searchInput.focus()
    })

    els.btnMenu.addEventListener('click', openSidebarMobile)
    els.scrim.addEventListener('click', closeSidebarMobile)

    /* 右键快捷菜单 */
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('click', function (e) {
      if (ctxMenu && !(e.target.closest && e.target.closest('.ctx-menu'))) hideCtxMenu()
    })
    window.addEventListener('scroll', hideCtxMenu, true)
    window.addEventListener('blur', hideCtxMenu)

    els.langSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button')
      if (!b) return
      setLang(b.getAttribute('data-lang'))
    })

    els.btnTheme.addEventListener('click', toggleTheme)
    els.btnUpdate.addEventListener('click', function () { checkUpdates(true) })
    els.statusUpdate.addEventListener('click', function () { checkUpdates(true) })

    els.brand.addEventListener('click', function () {
      els.searchInput.value = ''
      state.query = ''
      els.searchClear.hidden = true
      goHome()
      if (els.scroller) els.scroller.scrollTop = 0
    })
    els.brand.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') els.brand.click()
    })

    els.pageBack.addEventListener('click', pageBack)
    els.topSource.addEventListener('click', pageOpenSource)

    /* 文档内链接与内联关键词复制（首页与文章页） */
    function docClick(e) {
      var codeEl = e.target.closest ? e.target.closest('code.copyable') : null
      if (codeEl) {
        copyText(codeEl.textContent, '已复制：' + codeEl.textContent)
        return
      }
      var a = e.target.closest('a')
      if (!a) return
      var href = a.getAttribute('href')
      if (href) {
        e.preventDefault()
        handleDocLink(href)
      }
    }
    els.viewHome.addEventListener('click', docClick)
    els.pageBody.addEventListener('click', docClick)

    var tocRaf = 0
    function onScroller() {
      if (!tocRaf) {
        tocRaf = requestAnimationFrame(function () { tocRaf = 0; updateActiveToc() })
      }
      var scroller = els.scroller
      var top = scroller ? scroller.scrollTop : (window.scrollY || 0)
      els.topBar.classList.toggle('scrolled', top > 4)
      var toc = document.querySelector('.page-toc')
      if (toc) {
        var head = document.querySelector('.page-head')
        var limit = (head && head.offsetHeight) || 56
        var box = scroller ? scroller.getBoundingClientRect().top : 0
        toc.classList.toggle('stuck', toc.getBoundingClientRect().top <= box + limit + 2)
      }
    }
    if (els.scroller) els.scroller.addEventListener('scroll', onScroller, { passive: true })
    window.addEventListener('scroll', onScroller, { passive: true })

    document.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName ? e.target.tagName : ''
      var typing = tag === 'INPUT' || tag === 'TEXTAREA'
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault()
        els.searchInput.focus()
        els.searchInput.select()
        return
      }
      if (e.key === '/' && !typing) {
        e.preventDefault()
        els.searchInput.focus()
        return
      }
      if (e.altKey && String(e.key).toLowerCase() === 'e') {
        e.preventDefault()
        setLang(state.lang === 'zh' ? 'en' : 'zh')
        return
      }
      if (e.altKey && String(e.key).toLowerCase() === 't') {
        e.preventDefault()
        toggleTheme()
        return
      }
      if (e.key === 'Escape') {
        if (updateDlg) { hideUpdateDialog(); return }
        if (ctxMenu) { hideCtxMenu(); return }
        if (els.sidebar.classList.contains('open')) closeSidebarMobile()
        else if (state.mode === 'page' && (state.stack.length || state.baseMode === 'results')) pageBack()
      }
    })

    document.addEventListener('pointerdown', function (e) {
      var target = e.target && e.target.closest ? e.target.closest('.icon-btn, .tonal-btn, .chip, .result-card, .toc-chip, .seg button, .clear-btn, .text-btn, .nav-item, .nav-caption, .status-update, .brand') : null
      if (!target) return
      var rect = target.getBoundingClientRect()
      var d = Math.max(rect.width, rect.height) * 1.2
      var ink = document.createElement('span')
      ink.className = 'ripple-ink'
      ink.style.width = d + 'px'
      ink.style.height = d + 'px'
      ink.style.left = (e.clientX - rect.left - d / 2) + 'px'
      ink.style.top = (e.clientY - rect.top - d / 2) + 'px'
      target.appendChild(ink)
      setTimeout(function () { if (ink.parentNode) ink.parentNode.removeChild(ink) }, 620)
    })
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    var savedLang = store.get('lang', 'zh')
    if (savedLang !== 'zh' && savedLang !== 'en') savedLang = 'zh'
    state.lang = savedLang
    updateLangSeg()
    applyTheme(store.get('theme', 'auto'))
    renderFilterChips()
    renderStatus()
    resolveBrandIcon()
    bindEvents()

    if (!META) {
      toast('元数据加载失败：找不到 data/meta.js。请确认文件完整。', 12000)
      return
    }

    setProgress(true, 6)

    function boot() {
      return ensureLang(state.lang).then(function () {
        /* 首屏优先：先出界面，索引构建推迟到空闲 */
        renderSidebar()
        renderHome()
        buildIndexWhenIdle(state.lang)
        /* 启动自动更新检测（距上次检查超过 30 分钟才自动发起） */
        var last = parseInt(store.get('lastCheck', '0'), 10)
        var shouldAuto = !last || (Date.now() - last) > 30 * 60 * 1000
        if (shouldAuto) setTimeout(function () { checkUpdates(false) }, 1500)
        /* 另一语言：等界面空闲后再预取，避免启动阶段抢 CPU */
        var prefetch = function () {
          ensureLang(state.lang === 'zh' ? 'en' : 'zh').then(function () {
            renderSidebar()
            buildIndexWhenIdle(state.lang === 'zh' ? 'en' : 'zh')
          }).catch(function () {})
        }
        if (typeof requestIdleCallback === 'function') requestIdleCallback(prefetch, { timeout: 8000 })
        else setTimeout(prefetch, 8000)
      })
    }

    /* 若之前同步过更新，则优先使用用户目录中的新数据；失败自动回退内置数据 */
    var savedBase = store.get('dataBase', '')
    var start = Promise.resolve(null)
    if (savedBase) {
      start = loadScript(savedBase + 'meta.js').then(function () {
        META = window.RPD_META
        META.__base = savedBase
        state.dataBase = savedBase
      }).catch(function () { store.set('dataBase', '') })
    }

    function fallbackToBuiltin() {
      state.dataBase = ''
      store.set('dataBase', '')
      META = DEFAULT_META
      META.__base = ''
      state.data = { zh: null, en: null }
      state.idx = { zh: null, en: null }
      state.loadedChunks = { zh: {}, en: {} }
      state.loading = { zh: false, en: false }
      window.RPD_ZH_CHUNKS = []
      window.RPD_EN_CHUNKS = []
      return boot()
    }

    start.then(boot).catch(function (err) {
      if (state.dataBase) {
        return fallbackToBuiltin().catch(function () {
          toast('初始化失败：' + esc(err && err.message ? err.message : err), 12000)
        })
      }
      toast('初始化失败：' + esc(err && err.message ? err.message : err), 12000)
    })
  }

  /* 无头测试钩子（不影响正常运行） */
  if (typeof window !== 'undefined' && window.__RPD_TEST__) {
    window.__RPD_DEBUG = {
      state: state,
      els: els,
      search: search,
      tokenizeQuery: tokenizeQuery,
      buildIndex: buildIndex,
      renderSidebar: renderSidebar,
      renderHome: renderHome,
      goHome: goHome,
      openPage: openPage,
      runSearch: runSearch,
      highlightCode: highlightCode,
      copyText: copyText,
      inject: function (lang, pages) { state.data[lang] = pages; buildIndex(lang); }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()