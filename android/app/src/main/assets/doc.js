/* RenpyDoc Finder 手机版 —— 文档正文增强（高亮 / 复制 / 图片 / 内链 / 章节跟随）
   与桌面版同一套行为，但体积更小、只服务于 WebView 内的本地文档。 */
(function () {
  'use strict'

  var bridge = (typeof Android !== 'undefined' && Android) ? Android : null

  /* ---------------- 关键字表（与桌面版一致） ---------------- */
  var PY_KW = ('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield').split(' ')
  var PY_BUILTIN = ('abs all any bin bool bytes callable chr classmethod compile complex delattr dict dir divmod enumerate eval exec filter float format frozenset getattr globals hasattr hash help hex id input int isinstance issubclass iter len list locals map max memoryview min next object oct open ord pow print property range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip self cls None True False').split(' ')
  var RENPY_KW = ('define default init python early hide screen label menu return call jump if elif else while for in with at transform image style translate say window nvl centered extend voice scene show play queue stop pause pass and or not is from import as def class break continue try except finally raise global nonlocal lambda yield assert del on action contains use transclude block time true false textbutton imagebutton text key timer bar vbar hbox vbox grid fixed frame window viewport side drag draggable droppable drag_group imagemap hotspot hotbar ground insensitive mousearea null input button add has modal tag zorder variant predict roll_forward sensitive event music sound audio replaced replace behind onlayer layer end').split(' ')
  var RENPY_BUILTIN = ('renpy config store persistent gui Character DynamicCharacter Say Transform Sprite Movie ATL dissolve fade pixellate move ease easein easeout zoomin zoomout vpunch hpunch blinds squares wipeleft wiperight wipeup wipedown slideleft slideright slideup slidedown pushleft pushright pushup pushdown irisin irisout ImageDissolve AlphaDissolve CropMove PushMove ComposeTransition MultipleTransition DictTransitions notify screenshot quit restart fullscreen end_game error smoothstep linear None True False true false').split(' ')
  var RENPY_PROP = ('pos xpos ypos anchor xanchor yanchor align xalign yalign offset xoffset yoffset size xsize ysize area width height color text_color background padding margin spacing first_indent line_spacing xfill yfill fit xfit yfit min_width min_height minimum layout subtitle bold italic underline strikethrough font kerning size_group text_align xcenter ycenter zoom rotate alpha additive nearest matrixcolor shader crop corner_radii foreground idle hover insensitive selected action activate_sound alternate style_text style_prefix focus_mask keyboard_focus tooltip scope at on horizontal vertical xpadding ypadding first_spacing box_layout box_wrap order_reverse child children adjust_spacing antialias black_color cursor drop_shadow idle_color justify language line_leading newline_indent outlines rest_indent ruby_style slow_cps delay events tile warper start end who_color what_color cps ctc window_background window_xpos window_ypos window_xsize window_ysize fadein fadeout loop noloop').split(' ')
  var LBL_PREV = ('label screen transform style init translate with at behind onlayer as play queue stop music sound audio voice call jump show scene hide image define').split(' ')

  var SETS = null
  function sets() {
    if (SETS) return SETS
    function make(list) { var s = Object.create(null); for (var i = 0; i < list.length; i++) s[list[i]] = 1; return s }
    SETS = {
      pyKw: make(PY_KW), pyBuiltin: make(PY_BUILTIN),
      rpyKw: make(RENPY_KW), rpyBuiltin: make(RENPY_BUILTIN),
      prop: make(RENPY_PROP), lblPrev: make(LBL_PREV)
    }
    return SETS
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  function span(cls, text) { return '<span class="tok-' + cls + '">' + esc(text) + '</span>' }

  function isDigit(c) { return c >= '0' && c <= '9' }
  function isWordStart(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' }
  function isWordChar(c) { return isWordStart(c) || isDigit(c) }
  function isQuote(c) { return c === '"' || c === "'" }
  function isPrefixChar(c) { return c === 'r' || c === 'R' || c === 'u' || c === 'U' || c === 'b' || c === 'B' || c === 'f' || c === 'F' }

  /* 字符串：支持 r/b/f 前缀与三引号 */
  function readString(src, i) {
    var n = src.length
    var p = i
    var prefix = 0
    while (p < n && prefix < 2 && isPrefixChar(src.charAt(p))) { p++; prefix++ }
    if (p >= n || !isQuote(src.charAt(p))) return i
    var q = src.charAt(p)
    var triple = src.substr(p, 3) === q + q + q
    var j = p + (triple ? 3 : 1)
    while (j < n) {
      var c = src.charAt(j)
      if (c === '\\') { j += 2; continue }
      if (triple) {
        if (src.substr(j, 3) === q + q + q) return j + 3
      } else if (c === q) {
        return j + 1
      } else if (c === '\n') {
        return i /* 未闭合，按普通字符处理 */
      }
      j++
    }
    return n
  }

  function readNumber(src, i) {
    var n = src.length
    var j = i
    if (src.charAt(j) === '0' && (src.charAt(j + 1) === 'x' || src.charAt(j + 1) === 'X')) {
      j += 2
      while (j < n && /[0-9a-fA-F_]/.test(src.charAt(j))) j++
      return j
    }
    if (src.charAt(j) === '0' && (src.charAt(j + 1) === 'b' || src.charAt(j + 1) === 'B')) {
      j += 2
      while (j < n && (src.charAt(j) === '0' || src.charAt(j) === '1' || src.charAt(j) === '_')) j++
      return j
    }
    while (j < n && (isDigit(src.charAt(j)) || src.charAt(j) === '_')) j++
    if (src.charAt(j) === '.') {
      j++
      while (j < n && (isDigit(src.charAt(j)) || src.charAt(j) === '_')) j++
    }
    if (src.charAt(j) === 'e' || src.charAt(j) === 'E') {
      var k = j + 1
      if (src.charAt(k) === '+' || src.charAt(k) === '-') k++
      if (isDigit(src.charAt(k))) {
        j = k
        while (j < n && isDigit(src.charAt(j))) j++
      }
    }
    return j
  }

  function highlightCode(src, lang) {
    var S = sets()
    var isPy = lang === 'python'
    var kw = isPy ? S.pyKw : S.rpyKw
    var builtin = isPy ? S.pyBuiltin : S.rpyBuiltin
    var out = ''
    var i = 0
    var n = src.length
    var prevWord = ''
    while (i < n) {
      var c = src.charAt(i)
      /* 注释 */
      if (c === '#') {
        var e = i
        while (e < n && src.charAt(e) !== '\n') e++
        out += span('com', src.slice(i, e))
        i = e
        continue
      }
      /* 字符串 */
      var se = readString(src, i)
      if (se > i) {
        out += span('str', src.slice(i, se))
        i = se
        continue
      }
      /* 装饰器 */
      if (c === '@' && isWordStart(src.charAt(i + 1))) {
        var d = i + 1
        while (d < n && (isWordChar(src.charAt(d)) || src.charAt(d) === '.')) d++
        out += span('dec', src.slice(i, d))
        i = d
        continue
      }
      /* 数字 */
      if (isDigit(c) && !(i > 0 && isWordChar(src.charAt(i - 1)))) {
        var ne = readNumber(src, i)
        if (ne > i) {
          out += span('num', src.slice(i, ne))
          i = ne
          continue
        }
      }
      /* 标识符 */
      if (isWordStart(c)) {
        var w = i
        while (w < n && isWordChar(src.charAt(w))) w++
        var token = src.slice(i, w)
        var rest = src.slice(w)
        var cls = null
        if (kw[token]) cls = 'kw'
        else if (builtin[token]) cls = 'builtin'
        else if (S.lblPrev[prevWord]) cls = 'lbl'
        else if (!isPy && S.prop[token]) cls = 'prop'
        else if (rest.replace(/^[ \t]+/, '').charAt(0) === '(') cls = 'fn'
        out += cls ? span(cls, token) : esc(token)
        prevWord = token
        i = w
        continue
      }
      /* 变量插值 / 运算符 */
      if (c === '$') { out += span('kw', c); i++; continue }
      if ('+-*/%<>=!&|^~:'.indexOf(c) !== -1) { out += span('op', c); i++; continue }
      out += esc(c)
      i++
    }
    return out
  }

  /* ---------------- 正文增强 ---------------- */
  function applyCode(root) {
    var pres = root.querySelectorAll('pre')
    for (var i = 0; i < pres.length; i++) {
      var pre = pres[i]
      if (pre.getAttribute('data-hl') === '1') continue
      pre.setAttribute('data-hl', '1')
      var lang = pre.getAttribute('data-lang') || 'renpy'
      var src = pre.textContent
      if (lang !== 'text') {
        try { pre.innerHTML = highlightCode(src, lang) } catch (e) { /* 保持原文 */ }
      }
      /* 包进相对定位容器：复制按钮固定在右上角，代码横向滚动时按钮不再跟着跑 */
      var wrap = document.createElement('div')
      wrap.className = 'code-block'
      pre.parentNode.insertBefore(wrap, pre)
      wrap.appendChild(pre)

      var btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.type = 'button'
      btn.textContent = '复制'
      btn.setAttribute('data-code', src)
      wrap.appendChild(btn)
    }
    var codes = root.querySelectorAll('code')
    for (var k = 0; k < codes.length; k++) {
      var c = codes[k]
      if (c.closest && c.closest('pre')) continue
      if (c.parentNode && c.parentNode.tagName === 'PRE') continue
      c.classList.add('copyable')
    }
  }

  /* 图片：先找随包资源，再退回在线源（与桌面版同一套候选顺序） */
  function applyImages(root) {
    var imgs = root.querySelectorAll('img[data-docimg]')
    for (var i = 0; i < imgs.length; i++) {
      ;(function (img) {
        var key = img.getAttribute('data-docimg') || ''
        if (!key) return
        var isEn = key.indexOf('en/') === 0
        var rest = key.substring(key.indexOf('/') + 1)
        var base = rest.substring(rest.lastIndexOf('/') + 1)
        var noOshs = rest.indexOf('oshs/game/') === 0 ? rest.substring(10) : rest
        var cands = []
        if (isEn) {
          cands.push('/assets/docimg/en/' + base)
          cands.push('https://www.renpy.org/doc/html/_images/' + base)
        } else {
          cands.push('/assets/docimg/zh/' + rest)
          cands.push('/assets/docimg/zh/' + noOshs)
          cands.push('/assets/docimg/zh/' + base)
          cands.push('/assets/docimg/en/' + base)
          cands.push('https://www.renpy.org/doc/html/_images/' + base)
          cands.push('https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/source/' + rest)
          cands.push('https://cdn.jsdelivr.net/gh/renpy/renpy@master/gui/game/' + noOshs)
        }
        var w = img.getAttribute('data-width')
        if (w) img.style.maxWidth = w
        var idx = 0
        function next() {
          if (idx >= cands.length) {
            var ph = document.createElement('div')
            ph.className = 'doc-img-missing'
            ph.textContent = '图片未随包提供：' + rest
            if (img.parentNode) img.parentNode.replaceChild(ph, img)
            return
          }
          img.onerror = next
          img.src = cands[idx++]
        }
        next()
      })(imgs[i])
    }
  }

  /* ---------------- 链接与复制 ---------------- */
  function handleLink(a) {
    var href = a.getAttribute('href') || ''
    if (href.indexOf('PAGE:') === 0) {
      if (bridge) bridge.openDoc(href)
      return true
    }
    if (href.charAt(0) === '#') {
      window.scrollToAnchor(href.substring(1))
      return true
    }
    if (href.indexOf('http://') === 0 || href.indexOf('https://') === 0 || href.indexOf('mailto:') === 0) {
      if (bridge) bridge.openExternal(href)
      return true
    }
    return false
  }

  function copy(text) {
    if (!text) return
    if (bridge) bridge.copy(text)
  }

  document.addEventListener('click', function (e) {
    var t = e.target
    if (!t) return
    if (t.className === 'copy-btn') {
      copy(t.getAttribute('data-code') || '')
      e.preventDefault()
      return
    }
    var code = t.closest ? t.closest('code.copyable') : null
    if (code) {
      copy(code.textContent)
      e.preventDefault()
      return
    }
    var a = t.closest ? t.closest('a') : null
    if (a && handleLink(a)) e.preventDefault()
  }, false)

  /* ---------------- 章节跟随（供顶部芯片高亮） ---------------- */
  window.scrollToAnchor = function (id) {
    if (!id) return
    var el = document.getElementById(id)
    if (!el) return
    var top = el.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0) - 8
    window.scrollTo(0, top < 0 ? 0 : top)
  }

  var lastSection = ''
  var ticking = false
  function reportSection() {
    ticking = false
    if (!bridge || !bridge.onSection) return
    var nodes = document.querySelectorAll('h1[id], h2[id], h3[id], h4[id], dt[id]')
    var current = ''
    for (var i = 0; i < nodes.length; i++) {
      var top = nodes[i].getBoundingClientRect().top
      if (top <= 12) current = nodes[i].id
      else break
    }
    /* 只在真正滚到某个标题上方时才上报，避免页面顶部误选第一个标题 */
    if (current && current !== lastSection) {
      lastSection = current
      bridge.onSection(current)
    }
  }
  window.addEventListener('scroll', function () {
    if (ticking) return
    ticking = true
    window.requestAnimationFrame(reportSection)
  }, { passive: true })

  /* ---------------- 启动 ---------------- */
  function start() {
    var root = document.querySelector('.doc-body') || document.body
    applyImages(root)
    applyCode(root)
    reportSection()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
