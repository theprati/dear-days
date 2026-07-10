"use strict";
/* ═══════════════════════════════════════════════════════════
   Dear Days · storage.js
   Local-first storage (IndexedDB) + optional Supabase cloud sync.
   Everything saves on-device instantly; when logged in and online,
   changes push to the cloud and remote changes merge back in
   (last-write-wins by updated_at).
   ═══════════════════════════════════════════════════════════ */

/* ---------- IndexedDB ---------- */
const DB_NAME = "dearDays";
const DB_VER = 1;
let _db = null;

function idbOpen(){
  return new Promise(function(res, rej){
    if(_db) return res(_db);
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = function(e){
      const db = e.target.result;
      if(!db.objectStoreNames.contains("kv"))       db.createObjectStore("kv",       {keyPath:"key"});
      if(!db.objectStoreNames.contains("days"))     db.createObjectStore("days",     {keyPath:"date"});
      if(!db.objectStoreNames.contains("memories")) db.createObjectStore("memories", {keyPath:"id"});
      if(!db.objectStoreNames.contains("events"))   db.createObjectStore("events",   {keyPath:"id"});
      if(!db.objectStoreNames.contains("voice"))    db.createObjectStore("voice",    {keyPath:"id"});
    };
    req.onsuccess = function(){ _db = req.result; res(_db); };
    req.onerror = function(){ rej(req.error); };
  });
}
function idbPut(store, val){
  return idbOpen().then(function(db){
    return new Promise(function(res, rej){
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(val);
      tx.oncomplete = res; tx.onerror = function(){ rej(tx.error); };
    });
  });
}
function idbDel(store, key){
  return idbOpen().then(function(db){
    return new Promise(function(res, rej){
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = res; tx.onerror = function(){ rej(tx.error); };
    });
  });
}
function idbAll(store){
  return idbOpen().then(function(db){
    return new Promise(function(res, rej){
      const req = db.transaction(store).objectStore(store).getAll();
      req.onsuccess = function(){ res(req.result || []); };
      req.onerror = function(){ rej(req.error); };
    });
  });
}

/* ---------- in-memory state (mirror of IndexedDB) ---------- */
const Store = {
  profile:   {key:"profile", name:"Naira", updated_at:0, dirty:0},
  companion: {key:"companion", name:"Mochi", love:0, updated_at:0, dirty:0},
  days: {},        // date -> {date, mood, note, updated_at, dirty}
  memories: [],    // {id, date, title, kind, updated_at, deleted, dirty}
  events: [],      // {id, date, time, title, updated_at, deleted, dirty}
  voice: []        // {id, date, mime, duration, created_at, path, uploaded, deleted, dirty}  (blob kept in IndexedDB only)
};

function now(){ return Date.now(); }
function uid(){ return now().toString(36) + Math.random().toString(36).slice(2, 8); }

async function storeLoad(){
  const kv = await idbAll("kv");
  kv.forEach(function(row){
    if(row.key === "profile")   Store.profile = row;
    if(row.key === "companion") Store.companion = row;
  });
  (await idbAll("days")).forEach(function(d){ Store.days[d.date] = d; });
  Store.memories = await idbAll("memories");
  Store.events   = await idbAll("events");
  // voice: strip blobs from memory copy (fetched on demand)
  Store.voice = (await idbAll("voice")).map(function(v){
    return {id:v.id, date:v.date, mime:v.mime, duration:v.duration,
            created_at:v.created_at, path:v.path||"", uploaded:!!v.uploaded,
            deleted:!!v.deleted, dirty:v.dirty?1:0};
  });
}

/* ---------- write-through mutations ---------- */
async function setProfileName(name){
  Store.profile.name = name; Store.profile.updated_at = now(); Store.profile.dirty = 1;
  await idbPut("kv", Store.profile); syncSoon();
}
async function setCompanion(patch){
  Object.assign(Store.companion, patch);
  Store.companion.updated_at = now(); Store.companion.dirty = 1;
  await idbPut("kv", Store.companion); syncSoon();
}
async function setDay(date, patch){
  const d = Store.days[date] || {date:date, mood:null, note:""};
  Object.assign(d, patch);
  d.updated_at = now(); d.dirty = 1;
  Store.days[date] = d;
  await idbPut("days", d); syncSoon();
}
async function addMemoryRec(date, title, kind){
  const m = {id:uid(), date:date, title:title, kind:kind, updated_at:now(), deleted:0, dirty:1};
  Store.memories.push(m);
  await idbPut("memories", m); syncSoon();
  return m;
}
async function removeMemoryRec(id){
  const m = Store.memories.find(function(x){ return x.id === id; });
  if(!m) return;
  m.deleted = 1; m.updated_at = now(); m.dirty = 1;
  await idbPut("memories", m); syncSoon();
}
async function addEventRec(date, time, title){
  const e = {id:uid(), date:date, time:time||"", title:title, updated_at:now(), deleted:0, dirty:1};
  Store.events.push(e);
  await idbPut("events", e); syncSoon();
  return e;
}
async function removeEventRec(id){
  const e = Store.events.find(function(x){ return x.id === id; });
  if(!e) return;
  e.deleted = 1; e.updated_at = now(); e.dirty = 1;
  await idbPut("events", e); syncSoon();
}
async function addVoiceRec(date, blob, mime, duration){
  const v = {id:uid(), date:date, blob:blob, mime:mime, duration:duration,
             created_at:now(), path:"", uploaded:0, deleted:0, dirty:1, updated_at:now()};
  await idbPut("voice", v);
  const lite = Object.assign({}, v); delete lite.blob;
  Store.voice.push(lite); syncSoon();
  return lite;
}
async function removeVoiceRec(id){
  const v = Store.voice.find(function(x){ return x.id === id; });
  if(!v) return;
  v.deleted = 1; v.dirty = 1; v.updated_at = now();
  const full = await idbGetVoice(id);
  if(full){ full.deleted = 1; full.dirty = 1; full.updated_at = v.updated_at; delete full.blob; await idbPut("voice", full); }
  syncSoon();
}
function idbGetVoice(id){
  return idbOpen().then(function(db){
    return new Promise(function(res, rej){
      const req = db.transaction("voice").objectStore("voice").get(id);
      req.onsuccess = function(){ res(req.result); };
      req.onerror = function(){ rej(req.error); };
    });
  });
}
/* returns a playable object URL for a voice note (local blob, or cloud download) */
async function voiceUrl(id){
  const full = await idbGetVoice(id);
  if(full && full.blob) return URL.createObjectURL(full.blob);
  const v = Store.voice.find(function(x){ return x.id === id; });
  if(v && v.path && sb && sbUser){
    const r = await sb.storage.from("voice-notes").createSignedUrl(v.path, 3600);
    if(r.data && r.data.signedUrl){
      // cache the audio back locally
      try{
        const resp = await fetch(r.data.signedUrl);
        const blob = await resp.blob();
        if(full){ full.blob = blob; await idbPut("voice", full); }
        return URL.createObjectURL(blob);
      }catch(e){ return r.data.signedUrl; }
    }
  }
  return null;
}

/* ═══════════════ Supabase cloud sync (optional) ═══════════════ */
let sb = null;       // supabase client
let sbUser = null;   // current user
let syncTimer = null;
let syncStatus = "off";   // off | signedout | syncing | synced | error
let onSyncStatus = function(){};

function cloudConfigured(){
  const c = window.DEAR_DAYS_CONFIG || {};
  return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && window.supabase);
}
async function cloudInit(){
  if(!cloudConfigured()){ syncStatus = "off"; onSyncStatus(syncStatus); return; }
  const c = window.DEAR_DAYS_CONFIG;
  sb = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
  const s = await sb.auth.getSession();
  sbUser = s.data.session ? s.data.session.user : null;
  syncStatus = sbUser ? "synced" : "signedout";
  onSyncStatus(syncStatus);
  sb.auth.onAuthStateChange(function(_ev, session){
    sbUser = session ? session.user : null;
    syncStatus = sbUser ? "syncing" : "signedout";
    onSyncStatus(syncStatus);
    if(sbUser) syncNow();
  });
  if(sbUser) syncNow();
}
async function cloudSignIn(email){
  if(!sb) return {error:{message:"cloud not configured"}};
  return sb.auth.signInWithOtp({email:email, options:{emailRedirectTo: location.origin + location.pathname}});
}
async function cloudSignOut(){ if(sb) await sb.auth.signOut(); }

function syncSoon(){
  if(!sb || !sbUser) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
}

async function syncNow(){
  if(!sb || !sbUser || !navigator.onLine) return;
  syncStatus = "syncing"; onSyncStatus(syncStatus);
  try{
    await pushDirty();
    await pullRemote();
    syncStatus = "synced";
  }catch(e){
    console.warn("sync error", e);
    syncStatus = "error";
  }
  onSyncStatus(syncStatus);
}

async function pushDirty(){
  const u = sbUser.id;
  // profile + companion
  if(Store.profile.dirty){
    await sb.from("profile").upsert({user_id:u, name:Store.profile.name, updated_at:Store.profile.updated_at});
    Store.profile.dirty = 0; await idbPut("kv", Store.profile);
  }
  if(Store.companion.dirty){
    await sb.from("companion").upsert({user_id:u, name:Store.companion.name, love:Store.companion.love, updated_at:Store.companion.updated_at});
    Store.companion.dirty = 0; await idbPut("kv", Store.companion);
  }
  // days
  for(const k in Store.days){
    const d = Store.days[k];
    if(d.dirty){
      await sb.from("days").upsert({user_id:u, date:d.date, mood:d.mood, note:d.note, updated_at:d.updated_at});
      d.dirty = 0; await idbPut("days", d);
    }
  }
  // memories / events
  for(const m of Store.memories){
    if(m.dirty){
      await sb.from("memories").upsert({id:m.id, user_id:u, date:m.date, title:m.title, kind:m.kind, deleted:!!m.deleted, updated_at:m.updated_at});
      m.dirty = 0; await idbPut("memories", m);
    }
  }
  for(const e of Store.events){
    if(e.dirty){
      await sb.from("events").upsert({id:e.id, user_id:u, date:e.date, time:e.time, title:e.title, deleted:!!e.deleted, updated_at:e.updated_at});
      e.dirty = 0; await idbPut("events", e);
    }
  }
  // voice notes: upload audio first, then row
  for(const v of Store.voice){
    if(!v.dirty) continue;
    if(!v.deleted && !v.uploaded){
      const full = await idbGetVoice(v.id);
      if(full && full.blob){
        const ext = (v.mime.indexOf("mp4") >= 0 || v.mime.indexOf("aac") >= 0) ? "m4a"
                  : (v.mime.indexOf("webm") >= 0) ? "webm" : "audio";
        const path = u + "/" + v.id + "." + ext;
        const up = await sb.storage.from("voice-notes").upload(path, full.blob, {contentType:v.mime, upsert:true});
        if(up.error) throw up.error;
        v.path = path; v.uploaded = 1;
        full.path = path; full.uploaded = 1;
        await idbPut("voice", full);
      }
    }
    if(v.deleted && v.path){
      await sb.storage.from("voice-notes").remove([v.path]);
    }
    await sb.from("voice_notes").upsert({id:v.id, user_id:u, date:v.date, path:v.path, mime:v.mime,
      duration:v.duration, deleted:!!v.deleted, created_at:v.created_at, updated_at:v.updated_at||v.created_at});
    v.dirty = 0;
    const full2 = await idbGetVoice(v.id);
    if(full2){ full2.dirty = 0; await idbPut("voice", full2); }
  }
}

async function pullRemote(){
  const u = sbUser.id;
  const tn = function(x){ return typeof x === "number" ? x : (Date.parse(x) || 0); };

  const prof = await sb.from("profile").select("*").eq("user_id", u).maybeSingle();
  if(prof.data && tn(prof.data.updated_at) > Store.profile.updated_at){
    Store.profile.name = prof.data.name; Store.profile.updated_at = tn(prof.data.updated_at); Store.profile.dirty = 0;
    await idbPut("kv", Store.profile);
  }
  const comp = await sb.from("companion").select("*").eq("user_id", u).maybeSingle();
  if(comp.data && tn(comp.data.updated_at) > Store.companion.updated_at){
    Store.companion.name = comp.data.name; Store.companion.love = comp.data.love;
    Store.companion.updated_at = tn(comp.data.updated_at); Store.companion.dirty = 0;
    await idbPut("kv", Store.companion);
  }
  const days = await sb.from("days").select("*").eq("user_id", u);
  (days.data || []).forEach(async function(r){
    const loc = Store.days[r.date];
    if(!loc || tn(r.updated_at) > loc.updated_at){
      const d = {date:r.date, mood:r.mood, note:r.note, updated_at:tn(r.updated_at), dirty:0};
      Store.days[r.date] = d; await idbPut("days", d);
    }
  });
  const mems = await sb.from("memories").select("*").eq("user_id", u);
  for(const r of (mems.data || [])){
    const loc = Store.memories.find(function(x){ return x.id === r.id; });
    if(!loc){
      const m = {id:r.id, date:r.date, title:r.title, kind:r.kind, deleted:r.deleted?1:0, updated_at:tn(r.updated_at), dirty:0};
      Store.memories.push(m); await idbPut("memories", m);
    }else if(tn(r.updated_at) > loc.updated_at){
      loc.date=r.date; loc.title=r.title; loc.kind=r.kind; loc.deleted=r.deleted?1:0;
      loc.updated_at=tn(r.updated_at); loc.dirty=0; await idbPut("memories", loc);
    }
  }
  const evs = await sb.from("events").select("*").eq("user_id", u);
  for(const r of (evs.data || [])){
    const loc = Store.events.find(function(x){ return x.id === r.id; });
    if(!loc){
      const e = {id:r.id, date:r.date, time:r.time, title:r.title, deleted:r.deleted?1:0, updated_at:tn(r.updated_at), dirty:0};
      Store.events.push(e); await idbPut("events", e);
    }else if(tn(r.updated_at) > loc.updated_at){
      loc.date=r.date; loc.time=r.time; loc.title=r.title; loc.deleted=r.deleted?1:0;
      loc.updated_at=tn(r.updated_at); loc.dirty=0; await idbPut("events", loc);
    }
  }
  const vns = await sb.from("voice_notes").select("*").eq("user_id", u);
  for(const r of (vns.data || [])){
    const loc = Store.voice.find(function(x){ return x.id === r.id; });
    if(!loc){
      const v = {id:r.id, date:r.date, path:r.path, mime:r.mime, duration:r.duration,
                 created_at:tn(r.created_at), uploaded:1, deleted:r.deleted?1:0, dirty:0, updated_at:tn(r.updated_at)};
      Store.voice.push(v);
      await idbPut("voice", Object.assign({}, v));
    }else if(tn(r.updated_at) > (loc.updated_at||0)){
      loc.deleted = r.deleted?1:0; loc.path = r.path; loc.uploaded = 1; loc.updated_at = tn(r.updated_at); loc.dirty = 0;
      const full = await idbGetVoice(r.id);
      if(full){ full.deleted=loc.deleted; full.path=r.path; full.uploaded=1; full.updated_at=loc.updated_at; full.dirty=0; await idbPut("voice", full); }
    }
  }
  if(window.onStoreChanged) window.onStoreChanged();
}

window.addEventListener("online", function(){ syncSoon(); });
