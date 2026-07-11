// ============================================================
// dear days — data layer (REAL implementation)
// ------------------------------------------------------------
// Implements the backend contract from the design handoff on a
// local-first engine: IndexedDB on-device (instant, offline,
// audio blobs included) + optional Supabase cloud sync (magic
// link email login; last-write-wins merge by updated_at).
// The UI only talks to `api.*` — shapes match the mock exactly.
// Also injects a small cloud-backup button/panel (independent
// of the design runtime).
// ============================================================

/* ---------- IndexedDB core ---------- */
const DB_NAME = "dearDays";
const DB_VER = 1;
let _db = null;

function idbOpen() {
  return new Promise((res, rej) => {
    if (_db) return res(_db);
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const s of [["kv", "key"], ["days", "date"], ["memories", "id"], ["events", "id"], ["voice", "id"]]) {
        if (!db.objectStoreNames.contains(s[0])) db.createObjectStore(s[0], { keyPath: s[1] });
      }
    };
    req.onsuccess = () => { _db = req.result; res(_db); };
    req.onerror = () => rej(req.error);
  });
}
const idbPut = (store, val) => idbOpen().then((db) => new Promise((res, rej) => {
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(val);
  tx.oncomplete = res; tx.onerror = () => rej(tx.error);
}));
const idbAll = (store) => idbOpen().then((db) => new Promise((res, rej) => {
  const req = db.transaction(store).objectStore(store).getAll();
  req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error);
}));
const idbGet = (store, key) => idbOpen().then((db) => new Promise((res, rej) => {
  const req = db.transaction(store).objectStore(store).get(key);
  req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
}));

/* ---------- in-memory mirror ---------- */
const S = {
  profile: { key: "profile", name: "Naira", updated_at: 0, dirty: 0 },
  companion: { key: "companion", name: "Mochi", love: 0, updated_at: 0, dirty: 0 },
  days: {},      // date -> {date, mood, note, updated_at, dirty}
  memories: [],  // {id, date, title, kind, updated_at, deleted, dirty}
  events: [],    // {id, date, time, title, updated_at, deleted, dirty}
  voice: [],     // meta only; blobs stay in IndexedDB
};
const now = () => Date.now();
const uid = (p) => p + now().toString(36) + Math.random().toString(36).slice(2, 7);

let _loaded = null;
function ensureLoaded() {
  if (_loaded) return _loaded;
  _loaded = (async () => {
    for (const row of await idbAll("kv")) {
      if (row.key === "profile") S.profile = row;
      if (row.key === "companion") S.companion = row;
    }
    for (const d of await idbAll("days")) S.days[d.date] = d;
    S.memories = await idbAll("memories");
    S.events = await idbAll("events");
    S.voice = (await idbAll("voice")).map((v) => {
      const { blob, ...meta } = v;
      return meta;
    });
    cloudInit();
  })();
  return _loaded;
}

/* ---------- voice-note object URLs ---------- */
const urlCache = new Map(); // id -> object URL
async function ensureAudioUrl(v) {
  if (v.deleted) return null;
  if (urlCache.has(v.id)) return urlCache.get(v.id);
  const full = await idbGet("voice", v.id);
  if (full && full.blob) {
    const u = URL.createObjectURL(full.blob);
    urlCache.set(v.id, u);
    return u;
  }
  // not local — try the cloud
  if (v.path && sb && sbUser) {
    try {
      const r = await sb.storage.from("voice-notes").createSignedUrl(v.path, 3600);
      if (r.data && r.data.signedUrl) {
        const resp = await fetch(r.data.signedUrl);
        const blob = await resp.blob();
        if (full) { full.blob = blob; await idbPut("voice", full); }
        const u = URL.createObjectURL(blob);
        urlCache.set(v.id, u);
        return u;
      }
    } catch (e) { /* offline — fine */ }
  }
  return null;
}

/* ============ THE CONTRACT ============ */
export const api = {
  // ---- profile ----
  async getProfile() { await ensureLoaded(); return { name: S.profile.name }; },
  async setProfileName(name) {
    await ensureLoaded();
    S.profile.name = name; S.profile.updated_at = now(); S.profile.dirty = 1;
    await idbPut("kv", S.profile); syncSoon();
    return { name: S.profile.name };
  },

  // ---- companion ----
  async getCompanion() { await ensureLoaded(); return { name: S.companion.name, love_points: S.companion.love }; },
  async setCompanionName(name) {
    await ensureLoaded();
    S.companion.name = name; S.companion.updated_at = now(); S.companion.dirty = 1;
    await idbPut("kv", S.companion); syncSoon();
    return { name: S.companion.name, love_points: S.companion.love };
  },
  async addLove(points) {
    await ensureLoaded();
    S.companion.love += points; S.companion.updated_at = now(); S.companion.dirty = 1;
    await idbPut("kv", S.companion); syncSoon();
    return { name: S.companion.name, love_points: S.companion.love };
  },

  // ---- days ----
  async getDays() {
    await ensureLoaded();
    const out = {};
    for (const k in S.days) {
      const d = S.days[k];
      if (d.mood || (d.note && d.note.trim())) out[k] = { mood: d.mood || null, note: d.note || "" };
    }
    return out;
  },
  async saveDay(date, patch) {
    await ensureLoaded();
    const d = S.days[date] || { date, mood: null, note: "" };
    Object.assign(d, patch);
    d.updated_at = now(); d.dirty = 1;
    S.days[date] = d;
    await idbPut("days", d); syncSoon();
    return { mood: d.mood, note: d.note };
  },

  // ---- voice notes ----
  async listVoiceNotes(date) {
    await ensureLoaded();
    const live = S.voice.filter((v) => !v.deleted && v.date === date);
    for (const v of live) v.audio_url = await ensureAudioUrl(v);
    return live.map(shapeVoice);
  },
  async getAllVoiceNotes() {
    await ensureLoaded();
    const live = S.voice.filter((v) => !v.deleted);
    for (const v of live) v.audio_url = await ensureAudioUrl(v);
    return live.map(shapeVoice);
  },
  async addVoiceNote(date, blob, duration) {
    await ensureLoaded();
    const v = {
      id: uid("v"), date, mime: blob.type || "audio/webm",
      duration: Math.round(duration), created_at: now(),
      path: "", uploaded: 0, deleted: 0, dirty: 1, updated_at: now(),
    };
    await idbPut("voice", { ...v, blob });
    S.voice.push(v);
    v.audio_url = URL.createObjectURL(blob);
    urlCache.set(v.id, v.audio_url);
    syncSoon();
    return shapeVoice(v);
  },
  async deleteVoiceNote(id) {
    await ensureLoaded();
    const v = S.voice.find((x) => x.id === id);
    if (!v) return;
    v.deleted = 1; v.dirty = 1; v.updated_at = now();
    const full = await idbGet("voice", id);
    if (full) { delete full.blob; full.deleted = 1; full.dirty = 1; full.updated_at = v.updated_at; await idbPut("voice", full); }
    urlCache.delete(id);
    syncSoon();
  },

  // ---- memories ----
  async listMemories() {
    await ensureLoaded();
    return S.memories.filter((m) => !m.deleted)
      .slice().sort((a, b) => b.date.localeCompare(a.date))
      .map((m) => ({ id: m.id, date: m.date, title: m.title, kind: m.kind }));
  },
  async addMemory(date, title, kind) {
    await ensureLoaded();
    const m = { id: uid("m"), date, title, kind, updated_at: now(), deleted: 0, dirty: 1 };
    S.memories.push(m);
    await idbPut("memories", m); syncSoon();
    return { id: m.id, date, title, kind };
  },
  async deleteMemory(id) {
    await ensureLoaded();
    const m = S.memories.find((x) => x.id === id);
    if (!m) return;
    m.deleted = 1; m.updated_at = now(); m.dirty = 1;
    await idbPut("memories", m); syncSoon();
  },

  // ---- events ----
  async listEvents() {
    await ensureLoaded();
    return S.events.filter((e) => !e.deleted)
      .slice().sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ id: e.id, date: e.date, time: e.time || null, title: e.title }));
  },
  async addEvent(date, title, time) {
    await ensureLoaded();
    const e = { id: uid("e"), date, time: time || null, title, updated_at: now(), deleted: 0, dirty: 1 };
    S.events.push(e);
    await idbPut("events", e); syncSoon();
    return { id: e.id, date, time: e.time, title };
  },
  async deleteEvent(id) {
    await ensureLoaded();
    const e = S.events.find((x) => x.id === id);
    if (!e) return;
    e.deleted = 1; e.updated_at = now(); e.dirty = 1;
    await idbPut("events", e); syncSoon();
  },
};

function shapeVoice(v) {
  return {
    id: v.id, date: v.date, audio_url: v.audio_url || null,
    duration: v.duration, created_at: new Date(v.created_at).toISOString(),
  };
}

/* ============ Supabase cloud sync ============ */
let sb = null, sbUser = null, syncTimer = null;
let syncState = "off"; // off | signedout | syncing | synced | error

function cloudConfigured() {
  const c = window.DEAR_DAYS_CONFIG || {};
  return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && window.supabase);
}
async function cloudInit() {
  buildCloudUI();
  if (!cloudConfigured()) { setSyncState("off"); return; }
  const c = window.DEAR_DAYS_CONFIG;
  sb = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
  const s = await sb.auth.getSession();
  sbUser = s.data.session ? s.data.session.user : null;
  setSyncState(sbUser ? "synced" : "signedout");
  sb.auth.onAuthStateChange((_ev, session) => {
    sbUser = session ? session.user : null;
    setSyncState(sbUser ? "syncing" : "signedout");
    if (sbUser) syncNow();
  });
  if (sbUser) syncNow();
}
function syncSoon() {
  if (!sb || !sbUser) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
}
async function syncNow() {
  if (!sb || !sbUser || !navigator.onLine) return;
  setSyncState("syncing");
  try { await pushDirty(); await pullRemote(); setSyncState("synced"); }
  catch (e) { console.warn("sync error", e); setSyncState("error"); }
}

async function pushDirty() {
  const u = sbUser.id;
  if (S.profile.dirty) {
    await sb.from("profile").upsert({ user_id: u, name: S.profile.name, updated_at: S.profile.updated_at });
    S.profile.dirty = 0; await idbPut("kv", S.profile);
  }
  if (S.companion.dirty) {
    await sb.from("companion").upsert({ user_id: u, name: S.companion.name, love: S.companion.love, updated_at: S.companion.updated_at });
    S.companion.dirty = 0; await idbPut("kv", S.companion);
  }
  for (const k in S.days) {
    const d = S.days[k];
    if (d.dirty) {
      await sb.from("days").upsert({ user_id: u, date: d.date, mood: d.mood, note: d.note, updated_at: d.updated_at });
      d.dirty = 0; await idbPut("days", d);
    }
  }
  for (const m of S.memories) {
    if (m.dirty) {
      await sb.from("memories").upsert({ id: m.id, user_id: u, date: m.date, title: m.title, kind: m.kind, deleted: !!m.deleted, updated_at: m.updated_at });
      m.dirty = 0; await idbPut("memories", m);
    }
  }
  for (const e of S.events) {
    if (e.dirty) {
      await sb.from("events").upsert({ id: e.id, user_id: u, date: e.date, time: e.time, title: e.title, deleted: !!e.deleted, updated_at: e.updated_at });
      e.dirty = 0; await idbPut("events", e);
    }
  }
  for (const v of S.voice) {
    if (!v.dirty) continue;
    if (!v.deleted && !v.uploaded) {
      const full = await idbGet("voice", v.id);
      if (full && full.blob) {
        const ext = v.mime.includes("mp4") || v.mime.includes("aac") ? "m4a" : v.mime.includes("webm") ? "webm" : "audio";
        const path = u + "/" + v.id + "." + ext;
        const up = await sb.storage.from("voice-notes").upload(path, full.blob, { contentType: v.mime, upsert: true });
        if (up.error) throw up.error;
        v.path = path; v.uploaded = 1;
        full.path = path; full.uploaded = 1;
        await idbPut("voice", full);
      }
    }
    if (v.deleted && v.path) await sb.storage.from("voice-notes").remove([v.path]);
    await sb.from("voice_notes").upsert({
      id: v.id, user_id: u, date: v.date, path: v.path, mime: v.mime,
      duration: v.duration, deleted: !!v.deleted, created_at: v.created_at, updated_at: v.updated_at || v.created_at,
    });
    v.dirty = 0;
    const full2 = await idbGet("voice", v.id);
    if (full2) { full2.dirty = 0; await idbPut("voice", full2); }
  }
}

async function pullRemote() {
  const u = sbUser.id;
  const tn = (x) => (typeof x === "number" ? x : Date.parse(x) || 0);

  const prof = await sb.from("profile").select("*").eq("user_id", u).maybeSingle();
  if (prof.data && tn(prof.data.updated_at) > S.profile.updated_at) {
    S.profile.name = prof.data.name; S.profile.updated_at = tn(prof.data.updated_at); S.profile.dirty = 0;
    await idbPut("kv", S.profile);
  }
  const comp = await sb.from("companion").select("*").eq("user_id", u).maybeSingle();
  if (comp.data && tn(comp.data.updated_at) > S.companion.updated_at) {
    S.companion.name = comp.data.name; S.companion.love = comp.data.love;
    S.companion.updated_at = tn(comp.data.updated_at); S.companion.dirty = 0;
    await idbPut("kv", S.companion);
  }
  const days = await sb.from("days").select("*").eq("user_id", u);
  for (const r of days.data || []) {
    const loc = S.days[r.date];
    if (!loc || tn(r.updated_at) > loc.updated_at) {
      const d = { date: r.date, mood: r.mood, note: r.note, updated_at: tn(r.updated_at), dirty: 0 };
      S.days[r.date] = d; await idbPut("days", d);
    }
  }
  const mems = await sb.from("memories").select("*").eq("user_id", u);
  for (const r of mems.data || []) {
    const loc = S.memories.find((x) => x.id === r.id);
    if (!loc) {
      const m = { id: r.id, date: r.date, title: r.title, kind: r.kind, deleted: r.deleted ? 1 : 0, updated_at: tn(r.updated_at), dirty: 0 };
      S.memories.push(m); await idbPut("memories", m);
    } else if (tn(r.updated_at) > loc.updated_at) {
      Object.assign(loc, { date: r.date, title: r.title, kind: r.kind, deleted: r.deleted ? 1 : 0, updated_at: tn(r.updated_at), dirty: 0 });
      await idbPut("memories", loc);
    }
  }
  const evs = await sb.from("events").select("*").eq("user_id", u);
  for (const r of evs.data || []) {
    const loc = S.events.find((x) => x.id === r.id);
    if (!loc) {
      const e = { id: r.id, date: r.date, time: r.time, title: r.title, deleted: r.deleted ? 1 : 0, updated_at: tn(r.updated_at), dirty: 0 };
      S.events.push(e); await idbPut("events", e);
    } else if (tn(r.updated_at) > loc.updated_at) {
      Object.assign(loc, { date: r.date, time: r.time, title: r.title, deleted: r.deleted ? 1 : 0, updated_at: tn(r.updated_at), dirty: 0 });
      await idbPut("events", loc);
    }
  }
  const vns = await sb.from("voice_notes").select("*").eq("user_id", u);
  for (const r of vns.data || []) {
    const loc = S.voice.find((x) => x.id === r.id);
    if (!loc) {
      const v = { id: r.id, date: r.date, path: r.path, mime: r.mime, duration: r.duration, created_at: tn(r.created_at), uploaded: 1, deleted: r.deleted ? 1 : 0, dirty: 0, updated_at: tn(r.updated_at) };
      S.voice.push(v); await idbPut("voice", { ...v });
    } else if (tn(r.updated_at) > (loc.updated_at || 0)) {
      loc.deleted = r.deleted ? 1 : 0; loc.path = r.path; loc.uploaded = 1; loc.updated_at = tn(r.updated_at); loc.dirty = 0;
      const full = await idbGet("voice", r.id);
      if (full) { Object.assign(full, { deleted: loc.deleted, path: r.path, uploaded: 1, updated_at: loc.updated_at, dirty: 0 }); await idbPut("voice", full); }
    }
  }
}
window.addEventListener("online", () => syncSoon());

/* ============ tiny cloud-backup UI (outside the design runtime) ============ */
const PALETTE = { card: "#FFF8F5", pinkSoft: "#FBE3E9", red: "#D9435F", inkDeep: "#6E3448", inkSoft: "#B07285", shadow: "rgba(140,46,68,.3)" };
let ui = null;
function setSyncState(st) {
  syncState = st;
  if (!ui) return;
  const map = { off: "🤍", signedout: "☁️", syncing: "☁️", synced: "☁️", error: "⛅" };
  ui.btn.textContent = map[st] || "☁️";
  ui.btn.title = { off: "everything lives on this device", signedout: "tap to set up cloud backup", syncing: "syncing…", synced: "backed up to your cloud", error: "sync hiccup — tap to retry" }[st] || "";
  ui.btn.style.opacity = st === "synced" ? "1" : ".92";
  if (ui.panel.style.display !== "none") renderPanel();
}
function el(tag, css, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = text;
  return e;
}
function buildCloudUI() {
  if (ui || !window.document || !document.body) return;
  const btn = el("button",
    "position:fixed;top:14px;right:14px;z-index:80;width:42px;height:42px;border-radius:50%;border:none;cursor:pointer;" +
    "background:" + PALETTE.card + ";box-shadow:0 4px 0 " + PALETTE.shadow + ";font-size:18px;transition:transform .15s ease", "☁️");
  btn.onmouseenter = () => (btn.style.transform = "scale(1.1)");
  btn.onmouseleave = () => (btn.style.transform = "scale(1)");
  const panel = el("div",
    "position:fixed;top:64px;right:14px;z-index:80;width:min(88vw,320px);background:" + PALETTE.card + ";border-radius:22px;" +
    "box-shadow:0 6px 0 " + PALETTE.shadow + ",0 14px 34px rgba(70,20,35,.3);padding:16px;display:none;" +
    "font-family:'Mali',sans-serif;color:" + PALETTE.inkDeep);
  btn.onclick = () => {
    panel.style.display = panel.style.display === "none" ? "" : "none";
    if (panel.style.display !== "none") renderPanel();
  };
  document.body.appendChild(btn);
  document.body.appendChild(panel);
  ui = { btn, panel };
  setSyncState(syncState);
}
function renderPanel() {
  const p = ui.panel;
  p.innerHTML = "";
  p.appendChild(el("div", "font-family:'Lilita One',cursive;font-size:17px;margin-bottom:4px", "cloud backup ☁️"));
  if (!cloudConfigured()) {
    p.appendChild(el("div", "font-size:13px;line-height:1.5;color:" + PALETTE.inkSoft,
      "not set up yet — your diary still lives safely on this device 🤍"));
    return;
  }
  if (sbUser) {
    p.appendChild(el("div", "font-size:12.5px;line-height:1.5;color:" + PALETTE.inkSoft, "signed in as " + sbUser.email));
    p.appendChild(el("div", "font-size:12.5px;margin:4px 0 10px;color:" + PALETTE.inkSoft,
      { syncing: "syncing your memories…", synced: "everything is backed up 🤍", error: "sync hiccup — will retry" }[syncState] || ""));
    const row = el("div", "display:flex;gap:8px");
    const syncB = el("button", btnCss(true), "sync now");
    syncB.onclick = () => syncNow();
    const outB = el("button", btnCss(false), "sign out");
    outB.onclick = async () => { await sb.auth.signOut(); renderPanel(); };
    row.appendChild(syncB); row.appendChild(outB);
    p.appendChild(row);
    return;
  }
  p.appendChild(el("div", "font-size:12.5px;line-height:1.5;margin-bottom:8px;color:" + PALETTE.inkSoft,
    "no passwords — a magic sign-in link arrives by email. once signed in, everything backs up to your private cloud."));
  const input = el("input", "width:100%;box-sizing:border-box;border:none;border-radius:12px;background:" + PALETTE.pinkSoft +
    ";padding:10px 12px;font-family:'Mali',sans-serif;font-size:13.5px;color:" + PALETTE.inkDeep + ";outline:none;margin-bottom:8px");
  input.type = "email"; input.placeholder = "you@example.com";
  const send = el("button", btnCss(true), "send me a magic link ✨");
  const msg = el("div", "font-size:12px;margin-top:8px;color:" + PALETTE.inkSoft, "");
  send.onclick = async () => {
    const email = (input.value || "").trim();
    if (!email.includes("@")) { msg.textContent = "that email looks a little shy — try again 🤍"; return; }
    const r = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    msg.textContent = r.error ? "hmm: " + r.error.message : "✨ magic link sent — check your email!";
  };
  p.appendChild(input); p.appendChild(send); p.appendChild(msg);
}
function btnCss(primary) {
  return "flex:1;border:none;cursor:pointer;border-radius:99px;padding:9px 12px;font-family:'Lilita One',cursive;font-size:13px;" +
    (primary
      ? "background:" + PALETTE.red + ";color:" + PALETTE.card + ";box-shadow:0 4px 0 " + PALETTE.shadow
      : "background:" + PALETTE.pinkSoft + ";color:" + PALETTE.inkDeep + ";box-shadow:0 4px 0 rgba(140,46,68,.15)");
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildCloudUI);
else buildCloudUI();
