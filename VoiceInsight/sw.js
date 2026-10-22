/* VoiceInsight sw v1.0.3 — network-first HTML (updates appear immediately), cache-first assets */
const CACHE="voiceinsight-v1-0-3";
const ASSETS=[".","index.html","manifest.json","icon.svg"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  const isHTML=url.pathname.endsWith("/")||url.pathname.endsWith(".html");
  if(isHTML){
    /* HTML always goes to network first so new versions show up without cache fights */
    e.respondWith(fetch(e.request).then(r=>{
      const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;
    }).catch(()=>caches.match(e.request).then(hit=>hit||caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
    const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;
  }).catch(()=>caches.match("index.html"))));
});
