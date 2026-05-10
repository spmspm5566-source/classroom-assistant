/**
 * sw.js — Service Worker（PWA 離線支援）
 *
 * 策略：「Stale-While-Revalidate」
 *  1. 第一次載入：所有資源（HTML、JS、CSS、字型）放進 cache
 *  2. 後續載入：先回傳 cache 版本（瞬間打開），同時在背景拉取新版
 *  3. 拉到新版就更新 cache，下次載入用新的
 *
 * 結果：老師關掉網路也能繼續用，網路恢復時自動拿到更新。
 *
 * 注意：IndexedDB（Dexie）不需要 service worker 介入，瀏覽器原生支援離線。
 */

const CACHE_NAME = 'classroom-assistant-v1'

// 安裝：開啟 cache（不預載資源，等實際請求時才存）
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => self.skipWaiting())
  )
})

// 啟動：清掉舊版 cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// fetch：Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  const req = event.request

  // 只處理 GET（POST/PUT 等不快取）
  if (req.method !== 'GET') return
  // 不快取跨域（避免污染 cache）
  if (new URL(req.url).origin !== location.origin) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req)
      const networkPromise = fetch(req)
        .then((response) => {
          // 只快取 OK 回應
          if (response.ok) {
            cache.put(req, response.clone())
          }
          return response
        })
        .catch(() => cached)   // 沒網路就用 cache

      return cached || networkPromise
    })
  )
})
