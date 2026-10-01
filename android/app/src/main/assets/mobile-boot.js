/* RenpyDoc 手机外壳引导（在电脑版页面脚本之前执行）
 * 1) 默认主题设为浅色（用户没选过时）
 * 2) 提供 window.renpyDocUpdate：更新检测 / 打开外链 / 同步（电脑版 app.js 已预留这套接口） */
(function () {
  'use strict'

  try {
    if (localStorage.getItem('rpd.theme') === null) localStorage.setItem('rpd.theme', 'light')
  } catch (e) { /* ignore */ }

  var pending = {}

  function callShell(method, payload) {
    return new Promise(function (resolve, reject) {
      var token = 't' + Date.now() + Math.random().toString(16).slice(2)
      pending[token] = { resolve: resolve, reject: reject }
      try {
        if (typeof Android === 'undefined') { delete pending[token]; reject(new Error('no-shell')); return }
        if (method === 'check') Android.updateCheck(token)
        else if (method === 'syncDocs') Android.syncDocs(token, JSON.stringify(payload || {}))
        else { delete pending[token]; reject(new Error('unknown-method')) }
      } catch (e) {
        delete pending[token]
        reject(e)
      }
    })
  }

  window.__rpdBridgeResult = function (token, ok, payload) {
    var p = pending[token]
    if (!p) return
    delete pending[token]
    if (ok) p.resolve(JSON.parse(payload))
    else p.reject(new Error(payload))
  }

  window.renpyDocUpdate = {
    check: function () { return callShell('check') },
    syncDocs: function (payload) { return callShell('syncDocs', payload) },
    openExternal: function (url) {
      try { Android.openExternal(url) } catch (e) { /* ignore */ }
      return Promise.resolve(true)
    }
  }
})()
