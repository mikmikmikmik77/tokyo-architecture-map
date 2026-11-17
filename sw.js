// 서비스 워커: 앱 화면(목록·데이터)을 폰에 저장해 두어 오프라인에서도 열리게 합니다.
// 파일을 고쳐서 다시 올릴 때는 아래 버전 숫자를 하나 올려 주세요.
const VERSION = "v10";
const CACHE = "tokyo-arch-" + VERSION;
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "config.js",
  "data.js",
  "places.js",
  "photos.js",
  "sketch-data.js",
  "sketch-icons.js",
  "sketch.js",
  "app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];

// 건물 사진 목록(photos.js)을 읽어 와서 사진도 함께 저장합니다.
self.window = self;
try { importScripts("photos.js"); } catch (e) { self.PHOTOS = {}; }
const PHOTO_FILES = Object.values(self.PHOTOS || {}).map((p) => p.file);

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))
        // 사진은 하나쯤 실패해도 앱 설치가 막히지 않게 따로 받습니다.
        .then(() => Promise.all(PHOTO_FILES.map((u) => c.add(u).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tokyo-arch-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 같은 사이트의 파일만 다룹니다. (구글 지도 요청은 건드리지 않음)
// 연결이 좋으면 최신 파일을, 2.5초 안에 답이 없거나 오프라인이면 폰에 저장된 파일을 씁니다.
const WAIT_MS = 2500;
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === "navigate" ? await cache.match("index.html") : undefined);
    const fresh = fetch(req).then((res) => {
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    });
    if (!cached) return fresh;
    fresh.catch(() => {});
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), WAIT_MS));
    const res = await Promise.race([fresh.catch(() => null), timeout]);
    return res && res.ok ? res : cached;
  })());
});
