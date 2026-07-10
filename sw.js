/* Dear Days · service worker — offline app shell */
const CACHE = "dear-days-v1";
const ASSETS = ["./","./index.html","./styles.css","./app.js","./storage.js","./config.js","./manifest.json","./icon-192.png","./icon-512.png"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});
/* network-first so updates arrive, cache fallback so offline works */
self.addEventListener("fetch", function(e){
  if(e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if(url.origin !== location.origin) return;   // let CDN/Supabase requests pass through
  e.respondWith(
    fetch(e.request).then(function(resp){
      const copy = resp.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
      return resp;
    }).catch(function(){
      return caches.match(e.request).then(function(hit){ return hit || caches.match("./index.html"); });
    })
  );
});
