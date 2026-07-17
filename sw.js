/* Dear Days · service worker — offline app shell (v3, design build) */
const CACHE = "dear-days-v11";
const ASSETS = [
  "./", "./index.html", "./api.js", "./companion-logic.js", "./support.js", "./assets/mochi.png", "./config.js", "./manifest.json", "./icon-192.png", "./icon-512.png",
  "./vendor/react.min.js", "./vendor/react-dom.min.js", "./vendor/babel.min.js", "./vendor/supabase.min.js"
];

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
/* network-first so updates arrive; cache fallback so offline works */
self.addEventListener("fetch", function(e){
  if(e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if(url.origin !== location.origin) return;  // Supabase/fonts pass through
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
