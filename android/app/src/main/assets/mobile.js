/* RenpyDoc 手机端适配（在电脑版 app.js 之后加载）
 * 需求：顶栏的语言切换、主题切换、更新文档按钮移动到侧边栏。
 * 做法：直接把已有 DOM 节点搬进侧边栏底部——搬移而不是克隆，所以电脑版原有的事件监听全部保留。 */
(function () {
  'use strict'

  function relocate() {
    var lang = document.getElementById('langSeg')
    var theme = document.getElementById('btnTheme')
    var update = document.getElementById('btnUpdate')
    if (!lang || !theme || !update) return false

    /* 优先放侧边栏底部；万一没有就退回侧边栏顶部 */
    var host = document.querySelector('.sidebar-foot') ||
      document.querySelector('.sidebar') ||
      document.querySelector('#sidebar')
    if (!host) return false

    var box = document.querySelector('.mobile-actions')
    if (!box) {
      box = document.createElement('div')
      box.className = 'mobile-actions'
    }
    if (box.parentNode !== host) host.insertBefore(box, host.firstChild)
    box.appendChild(lang)
    box.appendChild(theme)
    box.appendChild(update)
    return true
  }

  /* 网页主题变化时，同步系统状态栏/导航栏图标颜色 */
  function syncShellTheme() {
    if (typeof Android === 'undefined' || !Android.shellTheme) return
    var dark = document.documentElement.getAttribute('data-theme') === 'dark'
    try { Android.shellTheme(dark) } catch (e) { /* ignore */ }
  }

  /* 章节芯片条：搬进顶栏固定显示（手机 WebView 里 position: sticky 不可靠）
     PC 的 app.js 持有的是同一个节点引用，搬移后跳转、高亮、点击全部照常工作。 */
  function pinTocBar() {
    var toc = document.getElementById('pageToc')
    var bar = document.querySelector('.top-bar')
    var page = document.getElementById('viewPage')
    if (!toc || !bar) return

    if (toc.parentNode !== bar) bar.appendChild(toc)
    bar.classList.add('has-toc')

    function sync() {
      var show = !!page && !page.hidden && toc.children.length > 0
      toc.style.display = show ? '' : 'none'
    }
    sync()
    try {
      if (page) {
        new MutationObserver(sync).observe(page, { attributes: true, attributeFilter: ['hidden'] })
      }
      new MutationObserver(sync).observe(toc, { childList: true })
    } catch (e) { /* ignore */ }
  }

  /* 全屏水波纹：只在品牌按钮上生效，从手指位置扩散出一圈直到铺满整屏。
     其它按钮（图标按钮 / 列表项 / 结果卡 / 标签 / 目录项等）只用按钮自身的局部水波，
     否则点哪儿都刷一层全屏，太吵。想让别的按钮也有，把选择器加进 SELECTOR 即可。 */
  function initFullRipple() {
    if (document.querySelector('.full-ripple-layer')) return
    var layer = document.createElement('div')
    layer.className = 'full-ripple-layer'
    document.body.appendChild(layer)

    var SELECTOR = '.brand'

    function spawn(x, y) {
      var vw = window.innerWidth
      var vh = window.innerHeight
      /* 半径取到最远的那个角，保证一定铺满整屏 */
      var r = Math.sqrt(Math.pow(Math.max(x, vw - x), 2) + Math.pow(Math.max(y, vh - y), 2))
      var ink = document.createElement('span')
      ink.className = 'full-ripple-ink'
      ink.style.width = (r * 2) + 'px'
      ink.style.height = (r * 2) + 'px'
      ink.style.left = (x - r) + 'px'
      ink.style.top = (y - r) + 'px'
      layer.appendChild(ink)
      setTimeout(function () { if (ink.parentNode) ink.parentNode.removeChild(ink) }, 760)
    }

    document.addEventListener('pointerdown', function (e) {
      var t = e.target && e.target.closest ? e.target.closest(SELECTOR) : null
      if (!t) return
      spawn(e.clientX, e.clientY)
    }, { passive: true })
  }

  function boot() {
    syncShellTheme()
    initFullRipple()
    pinTocBar()
    try {
      new MutationObserver(syncShellTheme).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      })
    } catch (e) { /* ignore */ }
    if (relocate()) return
    /* 侧边栏是按需渲染的，稍后再试几次 */
    var tries = 0
    var timer = setInterval(function () {
      tries++
      if (relocate() || tries > 60) clearInterval(timer)
    }, 250)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
