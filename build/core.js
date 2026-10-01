/* ============================================================
 * RenPyDoc core parser
 * 无依赖的纯 JS 解析器：EN Sphinx HTML -> 精简 HTML + 分节 + API 词条
 *                        CN reStructuredText -> 精简 HTML + 分节 + API 词条
 * 同时供 build.mjs（Node 命令行构建）与浏览器内构建器使用。
 * 文件内不使用反引号字符（用于生成器的安全嵌入）。
 * ============================================================ */
(function (global) {
  'use strict'

  var RPDCore = {}
  global.RPDCore = RPDCore

  var CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

  var ENTITY_MAP = {
    '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"',
    '&#39;': "'", '&#x27;': "'", '&apos;': "'", '&nbsp;': ' ',
    '&mdash;': '\u2014', '&ndash;': '\u2013', '&hellip;': '\u2026',
    '&ldquo;': '\u201c', '&rdquo;': '\u201d', '&lsquo;': '\u2018',
    '&rsquo;': '\u2019', '&copy;': '\u00a9', '&reg;': '\u00ae',
    '&trade;': '\u2122', '&deg;': '\u00b0', '&times;': '\u00d7',
    '&raquo;': '\u00bb', '&laquo;': '\u00ab', '&rarr;': '\u2192',
    '&larr;': '\u2190', '&uarr;': '\u2191', '&darr;': '\u2193',
    '&infin;': '\u221e', '&pi;': '\u03c0', '&le;': '\u2264',
    '&ge;': '\u2265', '&ne;': '\u2260', '&not;': '\u00ac',
    '&middot;': '\u00b7', '&bull;': '\u2022', '&sect;': '\u00a7',
    '&para;': '\u00b6', '&iexcl;': '\u00a1', '&iquest;': '\u00bf'
  }

  function decodeEntities(s) {
    return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (m, e) {
      if (Object.prototype.hasOwnProperty.call(ENTITY_MAP, m)) return ENTITY_MAP[m]
      if (e.charAt(0) === '#') {
        var code = (e.charAt(1) === 'x' || e.charAt(1) === 'X')
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10)
        if (isFinite(code)) {
          try { return String.fromCodePoint(code) } catch (err) { return m }
        }
      }
      return m
    })
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function stripTags(html) {
    return decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
  }

  function normalizeWs(s) {
    return String(s).replace(/\s+/g, ' ').trim()
  }

  function slugify(s) {
    var t = stripTags(String(s)).toLowerCase()
    t = t.replace(/[^\w\u4e00-\u9fff.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    return t || 'section'
  }

  function byteLen(s) {
    return unescape(encodeURIComponent(s)).length
  }

  function splitLines(s) {
    return String(s).replace(/\r\n?/g, '\n').split('\n')
  }

  /* 代码块去缩进：去掉公共前导空格、首尾空行与行尾空白 */
  function dedentCode(s) {
    var lines = splitLines(s)
    while (lines.length && lines[0].trim() === '') lines.shift()
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    var min = Infinity
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      var m = lines[i].match(/^[ \t]*/)
      if (m && m[0].length < min) min = m[0].length
    }
    if (isFinite(min) && min > 0) {
      for (i = 0; i < lines.length; i++) {
        if (lines[i]) lines[i] = lines[i].slice(min)
      }
    }
    for (i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/[ \t]+$/, '')
    return lines.join('\n')
  }

  /* ---------------- EN: Sphinx HTML ---------------- */

  function mapCodeLang(l) {
    l = String(l || '').toLowerCase()
    if (l === 'python' || l === 'python3' || l === 'pycon') return 'python'
    if (l === 'none' || l === 'text' || l === 'guess' || l === 'default') return 'text'
    return 'renpy'
  }

  function tokenize(html) {
    var tokens = []
    var re = /(<[^>]*>)|([^<]+)/g
    var m
    while ((m = re.exec(html))) {
      if (m[1] !== undefined) {
        var raw = m[1]
        var close = /^<\s*\//.test(raw)
        var self = /\/\s*>$/.test(raw)
        var inner = raw.replace(/^<\s*\/?/, '').replace(/\/?\s*>$/, '').trim()
        var nm = inner.match(/^([a-zA-Z][a-zA-Z0-9]*)/)
        var name = nm ? nm[1].toLowerCase() : ''
        var attrs = {}
        if (nm) {
          var rest = inner.slice(nm[0].length)
          var ar = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>\u0060]+))/g
          var am
          while ((am = ar.exec(rest))) {
            attrs[am[1].toLowerCase()] = am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : am[5])
          }
        }
        tokens.push({ t: 'tag', raw: raw, name: name, attrs: attrs, close: close, self: self })
      } else if (m[2] !== undefined) {
        tokens.push({ t: 'text', raw: m[2] })
      }
    }
    return tokens
  }

  var EN_KEEP = {
    p: 1, pre: 1, code: 1, dt: 1, dd: 1, dl: 1, ul: 1, ol: 1, li: 1,
    table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, th: 1, td: 1, caption: 1,
    blockquote: 1, strong: 1, b: 1, em: 1, i: 1, cite: 1, kbd: 1, samp: 1,
    var: 1, sub: 1, sup: 1, hr: 1, br: 1, figure: 1, figcaption: 1,
    details: 1, summary: 1, abbr: 1
  }
  var EN_SKIP_CONTENT = { script: 1, style: 1, noscript: 1, template: 1 }
  var EN_DROP_SINGLE = {
    img: 1, input: 1, button: 1, form: 1, meta: 1, link: 1, svg: 1,
    canvas: 1, iframe: 1, object: 1, embed: 1, video: 1, audio: 1,
    source: 1, track: 1, map: 1, area: 1
  }
  var EN_DROP_WRAP = {
    div: 1, section: 1, article: 1, span: 1, small: 1, big: 1, tt: 1,
    mark: 1, header: 1, footer: 1, nav: 1, main: 1, aside: 1, center: 1,
    font: 1, u: 1, s: 1, strike: 1, wbr: 1, label: 1, time: 1, picture: 1,
    output: 1, ruby: 1, bdi: 1, bdo: 1
  }

  function renderInlineTokens(tokens, a, b) {
    var out = ''
    var skip = false
    for (var i = a; i < b; i++) {
      var tk = tokens[i]
      if (tk.t === 'text') {
        if (!skip) out += decodeEntities(tk.raw).replace(/\s+/g, ' ')
        continue
      }
      var name = tk.name
      if (name === 'a' && !tk.close && (tk.attrs['class'] || '').indexOf('headerlink') !== -1) {
        skip = true
        continue
      }
      if (name === 'a' && tk.close) {
        if (skip) { skip = false; continue }
        out += '</a>'
        continue
      }
      if (skip) continue
      if (tk.close) {
        if (name === 'code' || name === 'em' || name === 'strong' || name === 'b' || name === 'i' || name === 'a') {
          out += '</' + name + '>'
        }
        continue
      }
      if (name === 'code' || name === 'em' || name === 'strong' || name === 'b' || name === 'i' || name === 'cite' || name === 'kbd' || name === 'var') {
        out += '<' + name + '>'
        continue
      }
      if (name === 'a') {
        var href = tk.attrs['href'] || ''
        out += '<a' + (href ? ' href="' + escapeHtml(href) + '"' : '') + '>'
        continue
      }
    }
    return out
  }

  function parseEn(html, slug) {
    var title = slug
    var tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (tm) title = normalizeWs(decodeEntities(tm[1]))
    title = title
      .replace(/\s*[—–-]\s*Ren'Py\s+Documentation\s*$/i, '')
      .replace(/^Welcome to\s+/i, '')
      .trim() || slug

    var mainIdx = html.search(/role="main"/i)
    var content = html
    if (mainIdx !== -1) {
      var gt = html.indexOf('>', mainIdx)
      var start = gt === -1 ? mainIdx : gt + 1
      var endIdx = html.indexOf('<footer', start)
      content = endIdx === -1 ? html.slice(start) : html.slice(start, endIdx)
    }

    var tokens = tokenize(content)
    var out = []
    var sections = [{ id: 'top', title: title, text: '' }]
    var terms = []
    var sectionStack = []
    var inPre = 0
    var preLangStack = []
    var divDepth = 0
    var admStack = []
    var admTitleOpen = 0
    var skipName = null
    var lastDlClass = ''
    var i = 0

    function cur() { return sections[sections.length - 1] }
    function addText(t) { cur().text += t }

    while (i < tokens.length) {
      var tk = tokens[i]

      if (tk.t === 'text') {
        if (!skipName) {
          var rawTxt = decodeEntities(tk.raw)
          var txt = escapeHtml(rawTxt)
          if (!inPre) txt = txt.replace(/\s+/g, ' ')
          out.push(txt)
          if (rawTxt.trim()) addText(' ' + normalizeWs(rawTxt))
        }
        i++
        continue
      }

      var name = tk.name

      if (skipName) {
        if (tk.close && name === skipName) {
          skipName = null
          i++
        } else {
          i++
        }
        continue
      }

      if (EN_SKIP_CONTENT[name]) {
        skipName = name
        i++
        continue
      }

      if (name === 'h1' || name === 'h2' || name === 'h3' || name === 'h4' || name === 'h5' || name === 'h6') {
        var j = i + 1
        while (j < tokens.length) {
          if (tokens[j].t === 'tag' && tokens[j].close && tokens[j].name === name) break
          j++
        }
        var inner = renderInlineTokens(tokens, i + 1, j)
        var ht = normalizeWs(stripTags(inner))
        var secId = sectionStack.length ? sectionStack[sectionStack.length - 1] : slugify(ht)
        var sec = { id: secId, title: ht, text: '' }
        sections.push(sec)
        out.push('<' + name + ' id="' + escapeHtml(secId) + '">' + inner + '</' + name + '>')
        if (ht) addText(' ' + ht)
        i = j < tokens.length ? j + 1 : j
        continue
      }

      if (name === 'dt' && tk.attrs['id'] && /\bsig\b/.test(tk.attrs['class'] || '')) {
        var j2 = i + 1
        var raw2 = ''
        while (j2 < tokens.length) {
          if (tokens[j2].t === 'tag' && tokens[j2].close && tokens[j2].name === 'dt') break
          if (tokens[j2].t === 'text') raw2 += decodeEntities(tokens[j2].raw)
          j2++
        }
        var dtText = normalizeWs(raw2)
        var short = normalizeWs(dtText.split('(')[0])
        var km = (lastDlClass || '').match(/(function|class|method|attribute|variable|var|data|property|label|exception)/)
        var kind = km ? (km[1] === 'variable' ? 'var' : km[1]) : 'api'
        terms.push({ id: tk.attrs['id'], name: short, kind: kind })
        out.push('<dt class="sig ' + kind + '" id="' + escapeHtml(tk.attrs['id']) + '">' + renderInlineTokens(tokens, i + 1, j2) + '</dt>')
        addText(' ' + short)
        i = j2 < tokens.length ? j2 + 1 : j2
        continue
      }

      if (name === 'section') {
        if (!tk.close) {
          if (tk.attrs['id']) sectionStack.push(tk.attrs['id'])
        } else if (sectionStack.length) {
          sectionStack.pop()
        }
        i++
        continue
      }

      if (name === 'dl') {
        if (tk.close) {
          lastDlClass = ''
          out.push('</dl>')
        } else {
          lastDlClass = tk.attrs['class'] || ''
          out.push('<dl>')
        }
        i++
        continue
      }

      if (name === 'img') {
        var isrc = tk.attrs['src'] || ''
        var ialt = tk.attrs['alt'] || ''
        if (isrc && isrc.indexOf('data:') !== 0) {
          var ibase = isrc.split('/').pop()
          if (ibase && /\.(png|jpe?g|gif|webp|svg)$/i.test(ibase)) {
            out.push('<img data-docimg="en/' + escapeHtml(ibase) + '" alt="' + escapeHtml(ialt || ibase) + '" loading="lazy">')
            if (ialt) addText(' ' + ialt)
          }
        }
        i++
        continue
      }

      if (EN_DROP_SINGLE[name]) { i++; continue }

      if (name === 'div') {
        if (!tk.close) {
          var cls = tk.attrs['class'] || ''
          var hm = cls.match(/highlight-([a-z0-9_-]+)/)
          if (hm) preLangStack.push({ lang: mapCodeLang(hm[1]), depth: divDepth })
          var am2 = cls.match(/admonition\s+([a-z]+)/)
          if (am2) {
            out.push('<div class="admonition ' + escapeHtml(am2[1]) + '">')
            admStack.push({ depth: divDepth })
          }
          divDepth++
        } else {
          if (divDepth > 0) divDepth--
          if (preLangStack.length && preLangStack[preLangStack.length - 1].depth === divDepth) preLangStack.pop()
          if (admStack.length && admStack[admStack.length - 1].depth === divDepth) {
            admStack.pop()
            out.push('</div>')
          }
        }
        i++
        continue
      }

      if (name === 'p' && tk.close && admTitleOpen > 0) {
        admTitleOpen--
        out.push('</div>')
        i++
        continue
      }

      if (name === 'p' && !tk.close && (tk.attrs['class'] || '').indexOf('admonition-title') !== -1) {
        admTitleOpen++
        out.push('<div class="admonition-title">')
        i++
        continue
      }

      if (name === 'a' && (tk.attrs['class'] || '').indexOf('headerlink') !== -1) {
        var d = 0
        while (i < tokens.length) {
          if (tokens[i].t === 'tag' && tokens[i].name === 'a') {
            if (tokens[i].close) { d--; if (d <= 0) { i++; break } }
            else d++
          }
          i++
        }
        continue
      }

      if (name === 'a') {
        if (tk.close) { out.push('</a>'); i++; continue }
        var href = tk.attrs['href'] || ''
        out.push('<a' + (href ? ' href="' + escapeHtml(href) + '"' : '') + '>')
        i++
        continue
      }

      if (name === 'pre') {
        if (tk.close) { if (inPre > 0) inPre--; out.push('</pre>') }
        else {
          inPre++
          var pl = 'renpy'
          if (preLangStack.length) pl = preLangStack[preLangStack.length - 1].lang
          out.push('<pre data-lang="' + pl + '">')
        }
        i++
        continue
      }

      if (EN_DROP_WRAP[name]) { i++; continue }

      if (EN_KEEP[name]) {
        out.push(tk.close ? '</' + name + '>' : '<' + name + '>')
        i++
        continue
      }

      i++
    }

    var cleanSections = []
    for (var s = 0; s < sections.length; s++) {
      var st = normalizeWs(sections[s].text)
      if (sections[s].id !== 'top' || st) {
        cleanSections.push({ id: sections[s].id, title: sections[s].title, text: st })
      }
    }

    var outHtml = out.join('')
    outHtml = outHtml.replace(/<pre data-lang="([^"]*)">([\s\S]*?)<\/pre>/g, function (m, lang, body) {
      return '<pre data-lang="' + lang + '">' + dedentCode(body) + '</pre>'
    })

    return {
      slug: slug,
      title: title,
      html: outHtml,
      sections: cleanSections,
      terms: terms
    }
  }

  /* ---------------- CN: reStructuredText ---------------- */

  var HEADING_CHARS = '=-~^"\u0027\u0060:._*+#' + "'"
  var HEADING_LEVEL = {
    '=': 1, '-': 2, '~': 3, '^': 4, '"': 5, "'": 6,
    '\u0060': 7, ':': 8, '.': 9, '_': 10, '*': 11, '+': 12, '#': 13
  }

  function isRule(line) {
    var t = String(line).trim()
    if (t.length < 3) return null
    var c = t.charAt(0)
    if (HEADING_CHARS.indexOf(c) === -1) return null
    for (var k = 1; k < t.length; k++) {
      if (t.charAt(k) !== c) return null
    }
    return c
  }

  function headingAt(lines, i) {
    if (i >= lines.length) return null
    var text = lines[i].trim()
    if (!text) return null
    if (i + 2 < lines.length) {
      var c0 = isRule(lines[i])
      var c2 = isRule(lines[i + 2])
      var mid = lines[i + 1].trim()
      if (c0 && c2 && c0 === c2 && mid && !isRule(lines[i + 1])) {
        return { text: mid, level: HEADING_LEVEL[c0] || 2, consume: 3 }
      }
    }
    if (i + 1 < lines.length) {
      var c1 = isRule(lines[i + 1])
      if (c1 && !isRule(lines[i]) && text.length >= 1) {
        if (lines[i + 1].trim().length + 1 >= text.length) {
          return { text: text, level: HEADING_LEVEL[c1] || 2, consume: 2 }
        }
      }
    }
    return null
  }

  var ADMONITION_TITLES = {
    note: '\u6ce8\u610f',
    warning: '\u8b66\u544a',
    tip: '\u63d0\u793a',
    important: '\u91cd\u8981',
    seealso: '\u53c2\u89c1',
    attention: '\u6ce8\u610f',
    danger: '\u5371\u9669',
    caution: '\u8b66\u544a',
    error: '\u9519\u8bef',
    hint: '\u63d0\u793a',
    deprecated: '\u5df2\u5f03\u7528',
    versionadded: '\u65b0\u589e\u4e8e',
    versionchanged: '\u53d8\u66f4\u4e8e'
  }

  var ADMONITION_SET = {}
  Object.keys(ADMONITION_TITLES).forEach(function (k) { ADMONITION_SET[k] = 1 })

  /* 跨文件标签解析：label -> 定义它的页面 slug */
  var ZH_LABELS = null
  var ZH_CURRENT = ''
  var ZH_LIT_LANG = 'renpy'
  function setZhLinkContext(labelMap, slug) {
    ZH_LABELS = labelMap || null
    ZH_CURRENT = slug || ''
    ZH_LIT_LANG = 'renpy'
  }
  function resolveLabel(anchor) {
    if (!ZH_LABELS || !anchor) return null
    var owner = ZH_LABELS[anchor]
    if (!owner) return null
    if (owner === ZH_CURRENT) return '#'
    return 'PAGE:' + owner + '#'
  }

  var TERM_KINDS = {}
  ;['function', 'class', 'method', 'attribute', 'var', 'data', 'label', 'define', 'default',
    'property', 'exception', 'enum',
    'transform-property', 'style-property', 'screen-property', 'text-tag',
    'envvar', 'option', 'describe'].forEach(function (k) { TERM_KINDS[k] = 1 })

  function zhInline(s) {
    var raw = String(s)
    var out = ''
    var last = 0
    var re = /:(?:py:)?(?:func|class|meth|attr|var|data|mod|exc|obj):\u0060[^\u0060]+\u0060|:[a-zA-Z][\w-]*:\u0060[^\u0060]+\u0060|\u0060\u0060[\s\S]*?\u0060\u0060|\u0060[^\u0060<]+?\s*<[^>]+>\u0060__|\u0060[^\u0060<]+?\s*<[^>]+>\u0060_|\u0060[^\u0060]+?\u0060_|\u0060[^\u0060\n]+?\u0060|\*\*[^*\n]+\*\*|(?:^|[^*])\*[^*\n]+\*(?!\*)/g
    var m
    while ((m = re.exec(raw))) {
      out += escapeHtml(raw.slice(last, m.index))
      out += zhConvert(m[0])
      last = re.lastIndex
    }
    out += escapeHtml(raw.slice(last))
    return out
  }

  function zhConvert(s) {
    var mm
    mm = s.match(/^:(?:py:)?(func|class|meth|attr|var|data|mod|exc|obj):\u0060([^\u0060]+)\u0060$/)
    if (mm) return '<code>' + escapeHtml(mm[2]) + '</code>'
    mm = s.match(/^:([a-zA-Z][\w-]*):\u0060([^\u0060]+)\u0060$/)
    if (mm) {
      var role = mm[1]
      var bt = mm[2]
      var anchor = ''
      var am = bt.match(/^(.*?)\s*<([^>]+)>$/)
      if (am) { bt = am[1]; anchor = am[2] }
      switch (role) {
        case 'file':
        case 'code':
        case 'game':
        case 'envvar':
        case 'token':
        case 'keyword':
        case 'samp':
        case 'kbd':
        case 'tt':
        case 'scpref':
        case 'exc':
        case 'command':
        case 'option':
          return '<code>' + escapeHtml(bt) + '</code>'
        case 'dfn':
        case 'term':
          return '<i>' + escapeHtml(bt) + '</i>'
        case 'guilabel':
          return '<kbd>' + escapeHtml(bt) + '</kbd>'
        case 'abbr':
          return '<abbr title="' + escapeHtml(bt) + '">' + escapeHtml(bt) + '</abbr>'
        case 'sup':
          return '<sup>' + escapeHtml(bt) + '</sup>'
        case 'sub':
          return '<sub>' + escapeHtml(bt) + '</sub>'
        case 'pep':
        case 'rfc':
          return 'PEP ' + escapeHtml(bt)
        case 'ref':
          if (!anchor) return escapeHtml(bt)
          var refPref = resolveLabel(anchor)
          if (refPref) return '<a href="' + refPref + escapeHtml(anchor) + '">' + escapeHtml(bt) + '</a>'
          return '<a href="#' + escapeHtml(anchor) + '">' + escapeHtml(bt) + '</a>'
        case 'doc':
          return anchor
            ? '<a href="PAGE:' + escapeHtml(anchor) + '">' + escapeHtml(bt) + '</a>'
            : '<a href="PAGE:' + escapeHtml(bt) + '">' + escapeHtml(bt) + '</a>'
        case 'func':
        case 'class':
        case 'meth':
        case 'attr':
        case 'var':
        case 'data':
        case 'label':
        case 'propref':
        case 'tpref':
        case 'style':
          return '<code>' + escapeHtml(bt) + '</code>'
        case 'menuselection':
          return escapeHtml(bt).replace(/-->/g, '\u2192')
        case 'download':
          return '<a href="' + escapeHtml(bt) + '">' + escapeHtml(bt) + '</a>'
        default:
          return escapeHtml(bt)
      }
    }
    mm = s.match(/^\u0060\u0060([\s\S]*?)\u0060\u0060$/)
    if (mm) return '<code>' + escapeHtml(mm[1]) + '</code>'
    mm = s.match(/^\u0060([^\u0060<]+?)\s+<([^>]+)>\u0060(__?)$/)
    if (mm) return '<a href="' + escapeHtml(mm[2]) + '" class="ext">' + escapeHtml(mm[1]) + '</a>'
    mm = s.match(/^\u0060([^\u0060]+?)\u0060_$/)
    if (mm) {
      var citePref = resolveLabel(mm[1])
      if (citePref) return '<a href="' + citePref + escapeHtml(mm[1]) + '">' + escapeHtml(mm[1]) + '</a>'
      return '<a href="#' + escapeHtml(mm[1]) + '">' + escapeHtml(mm[1]) + '</a>'
    }
    mm = s.match(/^\u0060([^\u0060\n]+?)\u0060$/)
    if (mm) return '<code>' + escapeHtml(mm[1]) + '</code>'
    mm = s.match(/^\*\*([^*\n]+)\*\*$/)
    if (mm) return '<b>' + escapeHtml(mm[1]) + '</b>'
    mm = s.match(/^(?:^|[^*])\*([^*\n]+)\*(?!\*)$/)
    if (mm) {
      var lead = s.charAt(0) === '*' ? '' : s.charAt(0)
      return lead + '<i>' + escapeHtml(mm[1]) + '</i>'
    }
    return escapeHtml(s)
  }

  function isOrderedMarker(mk) {
    return /^\(?\d/.test(mk)
  }

  function parseList(lines, i) {
    var first = lines[i].match(/^(\s*)([-*+]|(?:\d+[.)])|(?:\(\d+\)))\s+(.*)$/)
    if (!first) return null
    var baseIndent = first[1].replace(/\t/g, '    ').length
    var ordered = isOrderedMarker(first[2])
    var tag = ordered ? 'ol' : 'ul'
    var html = '<' + tag + '>'
    var j = i
    var hasItems = false
    while (j < lines.length) {
      var l = lines[j]
      if (l.trim() === '') {
        var k0 = j + 1
        while (k0 < lines.length && lines[k0].trim() === '') k0++
        var nxt = lines[k0]
        if (nxt && new RegExp('^\\s{0,' + baseIndent + '}([-*+]|(?:\\d+[.)])|(?:\\(\\d+\\)))\\s').test(nxt.replace(/\t/g, '    '))) {
          j = k0
          continue
        }
        break
      }
      var m = l.match(/^(\s*)([-*+]|(?:\d+[.)])|(?:\(\d+\)))\s+(.*)$/)
      if (!m) break
      var indent = m[1].replace(/\t/g, '    ').length
      if (indent > baseIndent) { j--; break }
      if (indent < baseIndent) break
      if ((isOrderedMarker(m[2]) ? 'ol' : 'ul') !== tag) break
      hasItems = true
      html += '<li><p>' + zhInline(m[3])
      var itemText = [m[3]]
      var k = j + 1
      var nested = ''
      while (k < lines.length) {
        var cl = lines[k]
        if (cl.trim() === '') {
          var k2 = k + 1
          while (k2 < lines.length && lines[k2].trim() === '') k2++
          var nxt2 = lines[k2]
          if (nxt2 && new RegExp('^\\s{0,' + baseIndent + '}([-*+]|(?:\\d+[.)])|(?:\\(\\d+\\)))\\s').test(nxt2.replace(/\t/g, '    '))) {
            k = k2
            continue
          }
          k = k2
          break
        }
        if (/^\s*\.\.\s/.test(cl)) break
        var cm = cl.match(/^(\s*)([-*+]|(?:\d+[.)])|(?:\(\d+\)))\s+(.*)$/)
        if (cm) {
          var cind = cm[1].replace(/\t/g, '    ').length
          if (cind > baseIndent) {
            var sub = parseList(lines, k)
            if (sub) { nested += sub.html; k = sub.next; continue }
          }
          break
        }
        if (cl.search(/\S/) <= baseIndent) break
        itemText.push(cl.trim())
        k++
      }
      html += ' ' + zhInline(itemText.slice(1).join(' ')) + '</p>' + nested + '</li>'
      j = k
    }
    if (!hasItems) return null
    html += '</' + tag + '>'
    return { html: html, next: j }
  }

  function parseGridTable(lines, i) {
    var j = i
    var rows = []
    var sep = null
    var guard = 0
    while (j < lines.length && guard < 500) {
      var l = lines[j]
      if (/^\s*\+[-=+]+\+\s*$/.test(l)) {
        sep = l
        j++
        guard++
        continue
      }
      if (/^\s*\|.*\|\s*$/.test(l)) {
        var cells = l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim() })
        var header = rows.length === 0 && sep !== null && sep.indexOf('=') !== -1
        rows.push({ cells: cells, header: header })
        j++
        guard++
        continue
      }
      break
    }
    if (rows.length < 2) return null
    var html = '<table>'
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>'
      for (var c = 0; c < rows[r].cells.length; c++) {
        var cellTag = rows[r].header ? 'th' : 'td'
        html += '<' + cellTag + '>' + zhInline(rows[r].cells[c]) + '</' + cellTag + '>'
      }
      html += '</tr>'
    }
    html += '</table>'
    return { html: html, next: j }
  }

  function parseSimpleTable(lines, i) {
    if (i + 1 >= lines.length) return null
    var under = lines[i + 1]
    if (!/^\s*=\s*(=\s*)*$/.test(under) || under.indexOf('=') === -1) return null
    var segs = []
    var re = /=+/g
    var m
    while ((m = re.exec(under))) segs.push({ s: m.index, e: m.index + m[0].length })
    if (segs.length < 2) return null
    var rows = []
    var j = i
    var rowIdx = 0
    var guard = 0
    while (j < lines.length && guard < 200) {
      var l = lines[j]
      if (l.trim() === '') break
      if (/^\s*=\s*(=\s*)*$/.test(l)) { j++; guard++; continue }
      if (/^\s*\.\.\s/.test(l)) break
      var cells = []
      for (var k = 0; k < segs.length; k++) {
        var from = segs[k].s
        var to = k + 1 < segs.length ? segs[k + 1].s : l.length
        cells.push(l.slice(from, to).trim())
      }
      rows.push({ cells: cells, header: rowIdx === 0 })
      rowIdx++
      j++
      guard++
    }
    if (rows.length < 1) return null
    var html = '<table>'
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>'
      for (var c = 0; c < rows[r].cells.length; c++) {
        var cellTag = rows[r].header ? 'th' : 'td'
        html += '<' + cellTag + '>' + zhInline(rows[r].cells[c]) + '</' + cellTag + '>'
      }
      html += '</tr>'
    }
    html += '</table>'
    return { html: html, next: j }
  }

  /* list-table 指令：* - 单元格 形式 */
  function parseListTable(lines, i) {
    var headerRows = 0
    var base = lines[i].search(/\S/)
    var j = i + 1
    while (j < lines.length) {
      var l = lines[j]
      if (l.trim() === '') { j++; continue }
      var om = l.match(/^\s*:([a-z-]+):\s*(.*)$/)
      if (om) {
        if (om[1] === 'header-rows' || om[1] === 'stub-columns') headerRows = parseInt(om[2], 10) || 0
        j++
        continue
      }
      break
    }
    var rows = []
    var cur = null
    while (j < lines.length) {
      var l2 = lines[j]
      if (l2.trim() === '') { j++; continue }
      if (l2.search(/\S/) <= base) break
      var rm = l2.match(/^\s*\*\s*-\s*(.*)$/)
      if (rm) { cur = [rm[1].trim()]; rows.push(cur); j++; continue }
      var cm = l2.match(/^\s*-\s*(.*)$/)
      if (cm && cur) { cur.push(cm[1].trim()); j++; continue }
      break
    }
    if (!rows.length) return null
    var html = '<table>'
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>'
      for (var c = 0; c < rows[r].length; c++) {
        var tag = r < headerRows ? 'th' : 'td'
        html += '<' + tag + '>' + zhInline(rows[r][c]) + '</' + tag + '>'
      }
      html += '</tr>'
    }
    html += '</table>'
    return { html: html, next: j }
  }

  /* csv-table 指令：选项 + CSV/引号行 */
  function parseCsvTable(lines, i) {
    var base = lines[i].search(/\S/)
    var headerRows = 0
    var j = i + 1
    var csvLines = []
    while (j < lines.length) {
      var l = lines[j]
      if (l.trim() === '') { j++; continue }
      if (l.search(/\S/) <= base) break
      var om = l.match(/^\s*:([a-z-]+):\s*(.*)$/)
      if (om) {
        if (om[1] === 'header-rows' || om[1] === 'stub-columns') headerRows = parseInt(om[2], 10) || 0
        j++
        continue
      }
      csvLines.push(l.trim())
      j++
    }
    if (!csvLines.length) return null
    var rows = []
    for (var k = 0; k < csvLines.length; k++) {
      var cells = []
      var line = csvLines[k]
      var re = /"([^"]*)"|([^,]+)/g
      var m
      while ((m = re.exec(line))) cells.push((m[1] !== undefined ? m[1] : m[2]).trim())
      if (cells.length) rows.push(cells)
    }
    if (!rows.length) return null
    var html = '<table>'
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>'
      for (var c = 0; c < rows[r].length; c++) {
        var tag = r < headerRows ? 'th' : 'td'
        html += '<' + tag + '>' + zhInline(rows[r][c]) + '</' + tag + '>'
      }
      html += '</tr>'
    }
    html += '</table>'
    return { html: html, next: j }
  }

  /* 字段列表：:type: xxx / :default: yyy */
  function parseFieldList(lines, i) {
    var base = lines[i].search(/\S/)
    var j = i
    var html = '<dl class="field-list">'
    var count = 0
    while (j < lines.length) {
      var l = lines[j]
      if (l.trim() === '') { j++; continue }
      if (l.search(/\S/) !== base) break
      var fm = l.match(/^\s*:([^:\s][^:]*):\s*(.*)$/)
      if (!fm) break
      var name = fm[1].trim()
      var parts = []
      if (fm[2].trim()) parts.push(fm[2].trim())
      var k = j + 1
      while (k < lines.length) {
        var kl = lines[k]
        if (kl.trim() === '') { k++; continue }
        if (kl.search(/\S/) > base && !/^\s*:([^:\s][^:]*):/.test(kl)) { parts.push(kl.trim()); k++ }
        else break
      }
      html += '<dt>' + zhInline(name) + '</dt><dd>' + zhInline(parts.join(' ')) + '</dd>'
      count++
      j = k
    }
    html += '</dl>'
    if (!count) return null
    return { html: html, next: j }
  }

  /* 定义列表：词条 + 缩进的定义块（RST 最常见的结构，必须保留换行） */
  function tryDefinitionList(lines, i) {
    var base = lines[i].search(/\S/)
    var first = lines[i]
    if (first.trim() === '') return null
    if (/^\s*\.\./.test(first)) return null
    if (/^\s*(?:[-*+]|\d+[.)]|\(\d+\))\s+/.test(first)) return null
    if (/^\s*[|+]/.test(first)) return null
    if (isRule(first)) return null
    if (/::\s*$/.test(first.trim())) return null
    var j = i
    var html = '<dl class="def-list">'
    var count = 0
    while (j < lines.length) {
      var l = lines[j]
      if (l.trim() === '') { j++; continue }
      if (l.search(/\S/) !== base) break
      if (isRule(l) || headingAt(lines, j)) break
      if (/^\s*\.\./.test(l)) break
      if (/^\s*(?:[-*+]|\d+[.)]|\(\d+\))\s+/.test(l)) break
      /* 找下一个非空行，必须缩进更深才算“词条 + 定义” */
      var k = j + 1
      while (k < lines.length && lines[k].trim() === '') k++
      if (k >= lines.length || lines[k].search(/\S/) <= base) break
      var term = l.trim()
      var defLines = []
      while (k < lines.length) {
        var kl = lines[k]
        if (kl.trim() === '') { defLines.push(''); k++; continue }
        if (kl.search(/\S/) > base) { defLines.push(kl); k++ }
        else break
      }
      var rd = renderBody(defLines, 0)
      html += '<dt>' + zhInline(term) + '</dt><dd>' + rd.html + '</dd>'
      count++
      j = k
    }
    html += '</dl>'
    if (!count) return null
    return { html: html, next: j }
  }

  /* 行块：| 开头的连续文本，保留换行 */
  function parseLineBlock(lines, i) {
    var base = lines[i].search(/\S/)
    var j = i
    var rows = []
    while (j < lines.length) {
      var l = lines[j]
      if (l.trim() === '') break
      if (l.search(/\S/) !== base) break
      var lm = l.match(/^\s*\|\s?(.*)$/)
      if (!lm) break
      rows.push(lm[1])
      j++
    }
    if (!rows.length) return null
    var html = '<div class="line-block">'
    for (var k = 0; k < rows.length; k++) html += '<div class="line">' + zhInline(rows[k]) + '</div>'
    html += '</div>'
    return { html: html, next: j }
  }

  function renderBody(lines, i) {
    var html = ''
    var text = ''
    var j = i
    var guard = 0
    while (j < lines.length && guard < 20000) {
      guard++
      var l = lines[j]
      if (l.trim() === '') { j++; continue }
      if (headingAt(lines, j)) break

      if (/^\s*\.\.\s/.test(l) && !/^\s*\.\.\./.test(l)) {
        if (/^\s*\.\.\s+_[\w-]+:\s*$/.test(l)) break
        var dm = l.match(/^\s*\.\.\s+([a-zA-Z][\w-]*)::\s*([\s\S]*)$/)
        var base = l.search(/\S/)
        if (dm) {
          var dn = dm[1]
          var arg = dm[2].trim()
          if (TERM_KINDS[dn] || dn === 'rubric') break
          if (dn === 'highlight') {
            /* .. highlight:: lang —— 只设置后续字面块的默认语言 */
            ZH_LIT_LANG = mapCodeLang(arg.split(/\s+/)[0] || 'renpy')
            var kh = j + 1
            while (kh < lines.length) {
              var khl = lines[kh]
              if (khl.trim() === '') { kh++; continue }
              if (khl.search(/\S/) > base && /^\s*:/.test(khl)) { kh++; continue }
              break
            }
            j = kh
            continue
          }
          if (dn === 'ifconfig' || dn === 'only') {
            /* 条件内容：无法求值时直接完整呈现，避免丢失 */
            var condInner = []
            var kc = j + 1
            while (kc < lines.length) {
              var kcl = lines[kc]
              if (kcl.trim() === '') { condInner.push(''); kc++; continue }
              if (kcl.search(/\S/) > base) { condInner.push(kcl); kc++ }
              else break
            }
            while (condInner.length && condInner[condInner.length - 1].trim() === '') condInner.pop()
            var rc = renderBody(condInner, 0)
            html += rc.html
            text += ' ' + rc.text
            j = kc
            continue
          }
          if (dn === 'list-table') {
            var lt = parseListTable(lines, j)
            if (lt) {
              html += lt.html
              text += ' ' + stripTags(lt.html)
              j = lt.next
              continue
            }
          }
          if (dn === 'csv-table') {
            var ct = parseCsvTable(lines, j)
            if (ct) {
              html += ct.html
              text += ' ' + stripTags(ct.html)
              j = ct.next
              continue
            }
          }
          if (dn === 'raw') {
            /* .. raw:: html —— 内容直接呈现（文档自带的少量 HTML 片段） */
            var rawLines = []
            var kr = j + 1
            while (kr < lines.length) {
              var krl = lines[kr]
              if (krl.trim() === '') { rawLines.push(''); kr++; continue }
              if (krl.search(/\S/) > base) { rawLines.push(krl); kr++ }
              else break
            }
            while (rawLines.length && rawLines[rawLines.length - 1].trim() === '') rawLines.pop()
            var rawHtml = dedentCode(rawLines.join('\n'))
            if (rawHtml) {
              html += rawHtml
              text += ' ' + stripTags(rawHtml)
            }
            j = kr
            continue
          }
          if (dn === 'include') {
            /* 引用的片段文件不在本地文档中时，明确标注而不是静默消失 */
            html += '<p class="doc-missing-part">该节内容引用了片段文件 <code>' + escapeHtml(arg) + '</code>' +
              '（本地文档未附带该文件，故此处无内容）</p>'
            text += ' ' + arg
            var ki = j + 1
            while (ki < lines.length) {
              var kil = lines[ki]
              if (kil.trim() === '') { ki++; continue }
              if (kil.search(/\S/) > base) ki++
              else break
            }
            j = ki
            continue
          }
          if (dn === 'glossary' || dn === 'hlist') {
            var gInner = []
            var kg = j + 1
            while (kg < lines.length) {
              var kgl = lines[kg]
              if (kgl.trim() === '') { gInner.push(''); kg++; continue }
              if (kgl.search(/\S/) > base) { gInner.push(kgl); kg++ }
              else break
            }
            while (gInner.length && gInner[gInner.length - 1].trim() === '') gInner.pop()
            var rg = renderBody(gInner, 0)
            html += rg.html
            text += ' ' + rg.text
            j = kg
            continue
          }
          if (dn === 'code-block' || dn === 'sourcecode' || dn === 'parsed-literal' || dn === 'code') {
            var pre = []
            var k = j + 1
            while (k < lines.length) {
              var kl = lines[k]
              if (kl.trim() === '') { pre.push(''); k++; continue }
              if (kl.search(/\S/) > base) { pre.push(kl); k++ }
              else break
            }
            while (pre.length && pre[pre.length - 1].trim() === '') pre.pop()
            var langAttr = mapCodeLang(arg.split(/\s+/)[0] || ZH_LIT_LANG)
            html += '<pre data-lang="' + langAttr + '">' + escapeHtml(dedentCode(pre.join('\n'))) + '</pre>'
            text += ' ' + pre.join(' ')
            j = k
            continue
          }
          if (ADMONITION_SET[dn]) {
            var inner = []
            var k2 = j + 1
            while (k2 < lines.length) {
              var k2l = lines[k2]
              if (k2l.trim() === '') { inner.push(''); k2++; continue }
              if (k2l.search(/\S/) > base) { inner.push(k2l); k2++ }
              else break
            }
            while (inner.length && inner[inner.length - 1].trim() === '') inner.pop()
            var rb = renderBody(inner, 0)
            var at = ADMONITION_TITLES[dn] || dn
            html += '<div class="admonition ' + dn + '"><div class="admonition-title">' + at + '</div>' + rb.html + '</div>'
            text += ' ' + at + ' ' + rb.text
            j = k2
            continue
          }
          if (dn === 'image' || dn === 'figure') {
            var imgPath = (arg.split(/\s+/)[0] || '').trim()
            var altText = ''
            var imgAttrs = ''
            var captionLines = []
            var seenCaption = false
            var k3 = j + 1
            while (k3 < lines.length) {
              var k3l = lines[k3]
              if (k3l.trim() === '') {
                if (seenCaption) break
                k3++
                continue
              }
              if (k3l.search(/\S/) <= base) break
              var opt = k3l.match(/^\s*:(alt|width|height|scale|align|target):\s*(.*)$/)
              if (opt) {
                if (opt[1] === 'alt') altText = opt[2].trim()
                if (opt[1] === 'width') imgAttrs += ' data-width="' + escapeHtml(opt[2].trim()) + '"'
                if (opt[1] === 'height') imgAttrs += ' data-height="' + escapeHtml(opt[2].trim()) + '"'
                k3++
                continue
              }
              if (dn === 'figure') { captionLines.push(k3l.trim()); seenCaption = true; k3++; continue }
              break
            }
            var caption = captionLines.join(' ')
            var imgAlt = altText || caption || imgPath
            var figHtml = '<figure class="doc-figure">'
            if (imgPath) {
              figHtml += '<img data-docimg="zh/' + escapeHtml(imgPath) + '" alt="' + escapeHtml(stripTags(zhInline(imgAlt))) + '"' + imgAttrs + ' loading="lazy">'
            }
            if (caption) figHtml += '<figcaption>' + zhInline(caption) + '</figcaption>'
            figHtml += '</figure>'
            html += figHtml
            text += ' ' + stripTags(imgAlt)
            j = k3
            continue
          }
          var k4 = j + 1
          while (k4 < lines.length) {
            var k4l = lines[k4]
            if (k4l.trim() === '') { k4++; continue }
            if (k4l.search(/\S/) > base) k4++
            else break
          }
          j = k4
          continue
        }
        var k5 = j + 1
        while (k5 < lines.length) {
          var k5l = lines[k5]
          if (k5l.trim() === '') { k5++; continue }
          if (k5l.search(/\S/) > base) k5++
          else break
        }
        j = k5
        continue
      }

      if (/::\s*$/.test(l.trim())) {
        var base6 = l.search(/\S/)
        var pre2 = []
        var k6 = j + 1
        while (k6 < lines.length) {
          var k6l = lines[k6]
          if (k6l.trim() === '') { pre2.push(''); k6++; continue }
          if (k6l.search(/\S/) > base6) { pre2.push(k6l); k6++ }
          else break
        }
        while (pre2.length && pre2[pre2.length - 1].trim() === '') pre2.pop()
        var intro = l.trim().replace(/::\s*$/, '')
        if (pre2.length) {
          html += (intro ? '<p>' + zhInline(intro) + '</p>' : '') + '<pre data-lang="' + ZH_LIT_LANG + '">' + escapeHtml(dedentCode(pre2.join('\n'))) + '</pre>'
          text += ' ' + stripTags(zhInline(intro)) + ' ' + pre2.join(' ')
        } else if (intro.trim()) {
          html += '<p>' + zhInline(intro) + '</p>'
          text += ' ' + stripTags(zhInline(intro))
        }
        j = k6
        continue
      }

      if (/^\s*\+[-=+]+\+\s*$/.test(l)) {
        var gt = parseGridTable(lines, j)
        if (gt) {
          html += gt.html
          text += ' ' + stripTags(gt.html)
          j = gt.next
          continue
        }
      }

      if (j + 1 < lines.length && /^\s*=\s*(=\s*)*$/.test(lines[j + 1]) && l.trim() !== '' && !/^\s*[|+]/.test(l)) {
        var st = parseSimpleTable(lines, j)
        if (st) {
          html += st.html
          text += ' ' + stripTags(st.html)
          j = st.next
          continue
        }
      }

      if (/^\s*(?:[-*+]|\d+[.)]|\(\d+\))\s+/.test(l)) {
        var lst = parseList(lines, j)
        if (lst) {
          html += lst.html
          text += ' ' + stripTags(lst.html)
          j = lst.next
          continue
        }
      }

      /* 行块（| 开头） */
      if (/^\s*\|(\s|$)/.test(l)) {
        var lbr = parseLineBlock(lines, j)
        if (lbr) {
          html += lbr.html
          text += ' ' + stripTags(lbr.html)
          j = lbr.next
          continue
        }
      }

      /* 字段列表（:type: / :default: 等） */
      if (/^\s*:[^:\s][^:]*:(\s|$)/.test(l)) {
        var flr = parseFieldList(lines, j)
        if (flr) {
          html += flr.html
          text += ' ' + stripTags(flr.html)
          j = flr.next
          continue
        }
      }

      /* 定义列表（词条 + 缩进定义） */
      var dlr = tryDefinitionList(lines, j)
      if (dlr) {
        html += dlr.html
        text += ' ' + stripTags(dlr.html)
        j = dlr.next
        continue
      }

      var para = [l.trim()]
      var k7 = j + 1
      while (k7 < lines.length) {
        var p7 = lines[k7]
        if (p7.trim() === '') break
        if (p7.trim() === '::') break
        if (isRule(p7)) break
        if (/^\s*\.\.\s/.test(p7)) break
        if (/::\s*$/.test(p7.trim())) break
        if (/^\s*(?:[-*+]|\d+[.)]|\(\d+\))\s+/.test(p7)) break
        if (/^\s*\+[-=+]+\+\s*$/.test(p7)) break
        if (/^\s*=\s*(=\s*)*$/.test(p7)) break
        para.push(p7.trim())
        k7++
        if (/::\s*$/.test(p7.trim())) break
      }
      var lastLine = para[para.length - 1]
      var trailingLiteral = /::\s*$/.test(lastLine.trim())
      if (trailingLiteral) {
        lastLine = lastLine.replace(/::\s*$/, '')
        para[para.length - 1] = lastLine
      }
      var pHtml = '<p>' + para.map(zhInline).join(' ') + '</p>'
      html += pHtml
      text += ' ' + stripTags(pHtml)
      if (trailingLiteral) {
        var baseP = lastLine.search(/\S/)
        var pre3 = []
        var k8 = k7
        while (k8 < lines.length) {
          var k8l = lines[k8]
          if (k8l.trim() === '') { pre3.push(''); k8++; continue }
          if (k8l.search(/\S/) > baseP) { pre3.push(k8l); k8++ }
          else break
        }
        while (pre3.length && pre3[pre3.length - 1].trim() === '') pre3.pop()
        if (pre3.length) {
          html += '<pre data-lang="' + ZH_LIT_LANG + '">' + escapeHtml(dedentCode(pre3.join('\n'))) + '</pre>'
          text += ' ' + pre3.join(' ')
          k7 = k8
        }
      }
      j = k7
    }
    return { html: html, text: text, next: j }
  }

  function parseZh(rst, slug) {
    var lines = splitLines(rst)
    var sections = [{ id: 'top', title: slug, text: '' }]
    var terms = []
    var pendingLabel = null
    var html = ''
    var title = slug
    var titleSet = false
    var i = 0
    var guard = 0

    function cur() { return sections[sections.length - 1] }
    function addHtml(h, t) {
      html += h
      cur().text += ' ' + (t !== undefined ? t : stripTags(h))
    }
    function addBlock(h, t) {
      var prefix = ''
      if (pendingLabel) {
        prefix = '<a class="rpd-anchor" id="' + escapeHtml(pendingLabel) + '"></a>'
        pendingLabel = null
      }
      addHtml(prefix + h, t)
    }

    while (i < lines.length && guard < 40000) {
      guard++
      var l = lines[i]
      if (l.trim() === '') { i++; continue }

      var lm = l.match(/^\s*\.\.\s+_([\w-]+):\s*$/)
      if (lm) {
        if (pendingLabel) addHtml('<a class="rpd-anchor" id="' + escapeHtml(pendingLabel) + '"></a>', '')
        pendingLabel = lm[1]
        i++
        continue
      }

      var dm = l.match(/^\s*\.\.\s+([a-zA-Z][\w-]*)::\s*([\s\S]*)$/)
      if (dm) {
        var dn = dm[1]
        var arg = dm[2].trim()
        var base = l.search(/\S/)
        var block = []
        var k = i + 1
        while (k < lines.length) {
          var kl = lines[k]
          if (kl.trim() === '') { block.push(''); k++; continue }
          if (kl.search(/\S/) > base) { block.push(kl); k++ }
          else break
        }
        while (block.length && block[block.length - 1].trim() === '') block.pop()
        if (TERM_KINDS[dn]) {
          var sig = arg
          if (!sig && block.length) sig = block.shift().trim()
          var short = sig.split('(')[0].split(/[=\s]/)[0].trim()
          var id = pendingLabel || slugify(short)
          var rb = renderBody(block, 0)
          addHtml(
            '<dt class="sig ' + dn + '" id="' + escapeHtml(id) + '"><code class="sig-name">' + escapeHtml(sig) + '</code></dt><dd>' + rb.html + '</dd>',
            sig + ' ' + rb.text
          )
          if (short) terms.push({ id: id, name: short, kind: dn })
          pendingLabel = null
          i = k
          continue
        }
        if (dn === 'rubric') {
          var rubTitle = arg || (block.length ? block.shift().trim() : '')
          var rubId = pendingLabel || slugify(rubTitle)
          addHtml('<h3 id="' + escapeHtml(rubId) + '">' + zhInline(rubTitle) + '</h3>', rubTitle)
          var rubRest = renderBody(block, 0)
          addHtml(rubRest.html, rubRest.text)
          pendingLabel = null
          i = k
          continue
        }
        var rb2 = renderBody(lines, i)
        addBlock(rb2.html, rb2.text)
        i = rb2.next
        continue
      }

      var hd = headingAt(lines, i)
      if (hd) {
        var secId = pendingLabel || slugify(hd.text)
        var sec = { id: secId, title: hd.text, text: '' }
        sections.push(sec)
        addHtml('<h' + Math.min(hd.level, 6) + ' id="' + escapeHtml(secId) + '">' + zhInline(hd.text) + '</h' + Math.min(hd.level, 6) + '>', hd.text)
        if (!titleSet && hd.level === 1) { title = hd.text; titleSet = true }
        pendingLabel = null
        i += hd.consume
        continue
      }

      var rb3 = renderBody(lines, i)
      addBlock(rb3.html, rb3.text)
      i = rb3.next
    }

    var cleanSections = []
    for (var s = 0; s < sections.length; s++) {
      var st = normalizeWs(sections[s].text)
      if (sections[s].id !== 'top' || st) {
        cleanSections.push({ id: sections[s].id, title: sections[s].title, text: st })
      }
    }

    return {
      slug: slug,
      title: title,
      html: html,
      sections: cleanSections,
      terms: terms
    }
  }

  /* ---------------- 导航结构提取（原版侧边栏目录） ---------------- */

  function parseEnNav(html) {
    var groups = []
    var m = html.indexOf('wy-menu')
    var slice = m !== -1 ? html.slice(m) : html
    var end = slice.indexOf('</nav>')
    if (end !== -1) slice = slice.slice(0, end)
    var re = /<p class="caption"[^>]*><span class="caption-text">([\s\S]*?)<\/span><\/p>([\s\S]*?)(?=<p class="caption"|$)/g
    var mm
    while ((mm = re.exec(slice))) {
      var caption = normalizeWs(stripTags(mm[1]))
      var items = []
      var ir = /<a class="reference internal" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
      var im
      while ((im = ir.exec(mm[2]))) {
        var slug = im[1].replace(/\.html$/, '').replace(/^#.*$/, '')
        var title = normalizeWs(stripTags(im[2]))
        if (slug && slug !== 'index') items.push({ slug: slug, title: title })
      }
      if (items.length) groups.push({ caption: caption, items: items })
    }
    return groups
  }

  function parseZhNav(rst) {
    var lines = splitLines(rst)
    var groups = []
    var i = 0
    while (i < lines.length) {
      var l = lines[i]
      var dm = l.match(/^\s*\.\.\s+toctree::\s*$/)
      if (!dm) { i++; continue }
      var caption = '\u76ee\u5f55'
      var items = []
      var k = i + 1
      while (k < lines.length) {
        var kl = lines[k]
        if (kl.trim() === '') { k++; continue }
        var cm = kl.match(/^\s*:caption:\s*(.+?)\s*$/)
        if (cm) { caption = cm[1].trim(); k++; continue }
        if (/^\s*:(maxdepth|hidden|titlesonly|glob|numbered):/.test(kl)) { k++; continue }
        if (kl.search(/\S/) === 0 && !/^\s*:/.test(kl)) break
        var im = kl.match(/^\s+(\S+)\s*$/)
        if (im && !/^:/.test(im[1])) {
          var slug = im[1].replace(/\.html$/, '').replace(/<.*$/, '').replace(/#.*$/, '')
          if (slug) items.push({ slug: slug, title: slug })
        }
        k++
      }
      if (items.length) groups.push({ caption: caption, items: items })
      i = k
    }
    /* 索引与脚本样例（正文列表里的跳转） */
    var extras = []
    var er = /^\s*\*\s*\u0060([^\u0060<]+?)\s+<([^>]+)>\u0060_\s*$/gm
    var em
    while ((em = er.exec(rst))) {
      var slug2 = em[2].replace(/\.html$/, '').replace(/^.*#/, '')
      if (slug2) extras.push({ slug: slug2, title: em[1].trim() })
    }
    var er2 = /^\s*\*\s*:doc:\u0060([^\u0060]+)\u0060\s*$/gm
    while ((em = er2.exec(rst))) {
      var slug3 = em[1].trim()
      if (slug3 && !extras.some(function (x) { return x.slug === slug3 })) extras.push({ slug: slug3, title: slug3 })
    }
    return { groups: groups, extras: extras }
  }

  /* ---------------- 分块与元数据 ---------------- */

  /* 安全字面量：JSON 直接作为 JS 数组字面量输出（省掉字符串转义层与一次 JSON.parse） */
  function toJsLiteral(json) {
    return String(json).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  }

  function packChunks(langKey, globalName, prefix, items, maxBytes) {
    maxBytes = maxBytes || 1500000
    var chunks = []
    var cur = []
    var curBytes = 0
    for (var i = 0; i < items.length; i++) {
      var s = JSON.stringify(items[i])
      var b = byteLen(s)
      if (cur.length && curBytes + b + 2 > maxBytes) {
        chunks.push(cur)
        cur = []
        curBytes = 0
      }
      cur.push(items[i])
      curBytes += b
    }
    if (cur.length) chunks.push(cur)
    return chunks.map(function (c, idx) {
      var name = 'data/' + prefix + '.' + idx + '.js'
      var js = 'window.' + globalName + ' = window.' + globalName + ' || [];\n' +
        'window.' + globalName + '.push(' + toJsLiteral(JSON.stringify(c)) + ');\n'
      return { name: name, content: js, pages: c.length }
    })
  }

  /* 索引层：结构 + 分节 + 词条（不含正文）；首页正文内联，首屏可立即渲染 */
  function makeIndexChunks(langKey, pages, maxBytes) {
    var items = pages.map(function (pg) {
      var o = {
        slug: pg.slug,
        title: pg.title,
        source: pg.source,
        sections: pg.sections,
        terms: pg.terms
      }
      if (pg.slug === 'index') o.homeHtml = pg.html
      return o
    })
    return packChunks(langKey, 'RPD_' + langKey.toUpperCase() + '_CHUNKS', langKey + '.chunk', items, maxBytes)
  }

  /* 正文层：按页存放 HTML，首次打开文档页时按需加载 */
  function makePageChunks(langKey, pages, maxBytes) {
    var items = pages
      .filter(function (pg) { return pg.slug !== 'index' })
      .map(function (pg) { return { slug: pg.slug, html: pg.html } })
    return packChunks(langKey, 'RPD_' + langKey.toUpperCase() + '_PAGES', langKey + '.pages', items, maxBytes)
  }

  function makeChunkFiles(langKey, pages, maxBytes) {
    return makeIndexChunks(langKey, pages, maxBytes)
  }

  function buildMeta(opts) {
    var meta = {
      appVersion: opts.appVersion || '1.0.0',
      generated: opts.generated || new Date().toISOString(),
      generator: 'RenPyDoc core',
      docZh: {
        label: '\u4e2d\u6587\u7ffb\u8bd1',
        sourceUrl: 'https://gitee.com/kurororo666/Renpydoc-ranslate',
        sourcePath: opts.zhPath || 'renpy_cn/source',
        version: opts.zhVersion || '',
        pages: opts.zhPages || 0
      },
      docEn: {
        label: '\u82f1\u6587\u539f\u7248',
        sourceUrl: 'https://www.renpy.org/doc/html/',
        sourcePath: opts.enPath || 'renpy_en',
        version: opts.enVersion || '',
        pages: opts.enPages || 0
      },
      update: {
        giteeRepo: 'kurororo666/Renpydoc-ranslate',
        giteeBranch: opts.giteeBranch || 'master',
        giteeApi: 'https://gitee.com/api/v5/repos/kurororo666/Renpydoc-ranslate/commits?per_page=1',
        enIndexUrl: 'https://www.renpy.org/doc/html/index.html',
        enDocsUrl: 'https://www.renpy.org/doc/html/'
      },
      chunks: {
        zh: (opts.zhFiles || []).map(function (f) { return f.name }),
        en: (opts.enFiles || []).map(function (f) { return f.name })
      }
    }
    var json = JSON.stringify(meta)
    return {
      name: 'data/meta.js',
      content: 'window.RPD_META = JSON.parse(' + JSON.stringify(json) + ');\n'
    }
  }

  function enVersionFromHtml(html) {
    var m = html.match(/([\d]+\.[\d]+(?:\.[\d]+)?)\s+Documentation/)
    return m ? m[1] : ''
  }

  function zhVersionFromFiles(files) {
    var h = 2166136261
    for (var i = 0; i < files.length; i++) {
      var s = files[i].name + ':' + files[i].len
      for (var k = 0; k < s.length; k++) {
        h ^= s.charCodeAt(k)
        h = (h * 16777619) >>> 0
      }
    }
    return 'local-' + h.toString(16)
  }

  RPDCore.renderBody = renderBody
  RPDCore.headingAt = headingAt
  RPDCore.decodeEntities = decodeEntities
  RPDCore.escapeHtml = escapeHtml
  RPDCore.stripTags = stripTags
  RPDCore.normalizeWs = normalizeWs
  RPDCore.slugify = slugify
  RPDCore.byteLen = byteLen
  RPDCore.parseEn = parseEn
  RPDCore.parseZh = parseZh
  RPDCore.parseEnNav = parseEnNav
  RPDCore.parseZhNav = parseZhNav
  RPDCore.setZhLinkContext = setZhLinkContext
  RPDCore.makeChunkFiles = makeChunkFiles
  RPDCore.makeIndexChunks = makeIndexChunks
  RPDCore.makePageChunks = makePageChunks
  RPDCore.buildMeta = buildMeta
  RPDCore.enVersionFromHtml = enVersionFromHtml
  RPDCore.zhVersionFromFiles = zhVersionFromFiles

})(typeof globalThis !== 'undefined' ? globalThis : this)
