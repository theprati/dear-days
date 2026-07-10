"use strict";
/* ═══ Dear Days · app.js — UI logic ═══ */

/* ---------- helpers ---------- */
const MOODS = [
  {id:"lovely", emoji:"🥰", color:"#ef8ba3", label:"lovely"},
  {id:"soft",   emoji:"🌸", color:"#f7b8c6", label:"soft"},
  {id:"okay",   emoji:"☁️", color:"#c9b6d9", label:"okay"},
  {id:"heavy",  emoji:"🌧️", color:"#93a9c9", label:"heavy"},
  {id:"sleepy", emoji:"💤", color:"#d9c9a4", label:"sleepy"}
];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const KIND_ICON = {start:"🌱", end:"🍂", anniversary:"🎀", moment:"✨"};
const KIND_WORD = {start:"since", end:"since", anniversary:"of", moment:"since"};

function $(id){ return document.getElementById(id); }
function pad(n){ return String(n).padStart(2,"0"); }
function keyOf(y,m,d){ return y + "-" + pad(m+1) + "-" + pad(d); }
function todayKey(){ const t = new Date(); return keyOf(t.getFullYear(), t.getMonth(), t.getDate()); }
function parseKey(k){ const p = k.split("-"); return {y:+p[0], m:+p[1]-1, d:+p[2]}; }
function prettyDate(k){ const p = parseKey(k); return MONTHS[p.m] + " " + p.d + ", " + p.y; }
function yearsBetween(memKey, refKey){
  const a = parseKey(memKey), b = parseKey(refKey);
  let yrs = b.y - a.y;
  if(b.m < a.m || (b.m === a.m && b.d < a.d)) yrs--;
  return yrs;
}
function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function liveMemories(){ return Store.memories.filter(function(m){ return !m.deleted; }); }
function liveEvents(){ return Store.events.filter(function(e){ return !e.deleted; }); }
function liveVoice(date){ return Store.voice.filter(function(v){ return !v.deleted && v.date === date; }); }

/* ---------- companion ---------- */
const STAGES = [
  {min:0,  label:"tiny bun",   scale:.8,   bow:false, crown:false},
  {min:10, label:"soft bun",   scale:.92,  bow:true,  crown:false},
  {min:30, label:"fluffy bun", scale:1,    bow:true,  crown:false},
  {min:60, label:"cloud bun",  scale:1.08, bow:true,  crown:true}
];
const NEXT_AT = [10,30,60,60];
function currentStage(){
  let s = STAGES[0], idx = 0;
  for(let i=0;i<STAGES.length;i++){ if(Store.companion.love >= STAGES[i].min){ s = STAGES[i]; idx = i; } }
  return {stage:s, idx:idx};
}
function bunnySVG(){
  const st = currentStage().stage;
  const bow = st.bow ? '<g transform="translate(50,14)"><path d="M0 0 C -6 -7, -16 -6, -14 2 C -13 7, -5 6, 0 2 C 5 6, 13 7, 14 2 C 16 -6, 6 -7, 0 0 Z" fill="#e05572"/><circle cx="0" cy="1" r="3.4" fill="#c9425f"/></g>' : "";
  const crown = st.crown ? '<g transform="translate(50,8)" font-size="7"><text x="-14" y="0">🌼</text><text x="-4" y="-3">🌸</text><text x="6" y="0">🌼</text></g>' : "";
  return '<svg viewBox="0 0 100 100"><g transform="translate(50,52) scale(' + st.scale + ') translate(-50,-52)">' +
    '<ellipse cx="38" cy="26" rx="8" ry="20" fill="#fff" stroke="#f7b8c6" stroke-width="1.5" transform="rotate(-10 38 26)"/>' +
    '<ellipse cx="62" cy="26" rx="8" ry="20" fill="#fff" stroke="#f7b8c6" stroke-width="1.5" transform="rotate(10 62 26)"/>' +
    '<ellipse cx="38" cy="28" rx="4" ry="13" fill="#fbd5de" transform="rotate(-10 38 28)"/>' +
    '<ellipse cx="62" cy="28" rx="4" ry="13" fill="#fbd5de" transform="rotate(10 62 28)"/>' +
    '<ellipse cx="50" cy="62" rx="28" ry="25" fill="#fff" stroke="#f7b8c6" stroke-width="1.5"/>' +
    '<ellipse cx="50" cy="70" rx="18" ry="12" fill="#fff9fa"/>' +
    '<circle cx="41" cy="58" r="3" fill="#5f2c3e"/><circle cx="59" cy="58" r="3" fill="#5f2c3e"/>' +
    '<circle cx="42.2" cy="56.8" r="1" fill="#fff"/><circle cx="60.2" cy="56.8" r="1" fill="#fff"/>' +
    '<ellipse cx="34" cy="65" rx="4.5" ry="3" fill="#fbd5de"/><ellipse cx="66" cy="65" rx="4.5" ry="3" fill="#fbd5de"/>' +
    '<path d="M47 64 Q50 67 53 64" stroke="#e05572" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="50" cy="62.2" rx="2.2" ry="1.6" fill="#ef8ba3"/>' +
    '<ellipse cx="36" cy="82" rx="7" ry="5" fill="#fff" stroke="#f7b8c6" stroke-width="1.2"/>' +
    '<ellipse cx="64" cy="82" rx="7" ry="5" fill="#fff" stroke="#f7b8c6" stroke-width="1.2"/>' +
    bow + crown + '</g></svg>';
}
const CHIRPS = {
  greet:["hi hi!! i missed you 🤍","you came back!! *happy wiggle*","today is a good day for soft things 🌸","i kept all your memories safe while you were away 🎀","*flops over with joy*"],
  mood:["thank you for telling me how you feel 🤍","noted in my little heart 💗","whatever you feel is okay with me 🌸","*gently holds your feeling* i've got it","you showed up today. that counts."],
  note:["a new diary page!! i will guard it forever 📖","your words are safe with me 🤍","*carefully presses the page like a flower*","one more little piece of your story 🎀"],
  memory:["oh!! a special day!! planting it in the garden 🌷","i will remind you when it blooms again 🎀","*tucks it in with a tiny bow* done!","the garden grows prettier because of you 🌸"],
  voice:["i heard every word 🤍 keeping it safe","your voice is my favourite sound 🎙️💗","*presses the little recording to my chest*"],
  grow:["!!! i grew a little because you love me 🤍","look at me!! all your care made me fluffier!!"]
};
function chirp(kind){
  const pool = CHIRPS[kind] || CHIRPS.greet;
  $("speech").textContent = pool[Math.floor(Math.random()*pool.length)];
}
async function addLove(pts, kind){
  const before = currentStage().idx;
  await setCompanion({love: Store.companion.love + pts});
  const after = currentStage().idx;
  renderCompanion();
  if(after > before){ chirp("grow"); toast("🎀 " + Store.companion.name + " grew into a " + currentStage().stage.label + "!!"); sparkleBurst(); }
  else if(kind){ chirp(kind); }
}
function renderCompanion(){
  $("bunnyHolder").innerHTML = bunnySVG();
  const cs = currentStage();
  $("stageLabel").textContent = cs.stage.label;
  $("companionName").textContent = Store.companion.name;
  const nxt = NEXT_AT[cs.idx], prev = cs.stage.min;
  const pct = cs.idx >= STAGES.length-1 ? 100 : Math.min(100, Math.round(((Store.companion.love - prev)/(nxt - prev))*100));
  $("careBar").style.width = pct + "%";
}

/* ---------- today card ---------- */
function renderToday(){
  const nowD = new Date();
  const tk = todayKey();
  const h = nowD.getHours();
  const name = Store.profile.name || "lovely";
  let g = "good morning, " + name + " ☀️";
  if(h >= 12 && h < 17) g = "good afternoon, " + name + " 🌸";
  else if(h >= 17 && h < 21) g = "good evening, " + name + " 🌙";
  else if(h >= 21 || h < 5) g = "hi night owl " + name + " 🌙✨";
  $("greeting").textContent = g;
  $("todayDateLine").textContent = WDAYS[nowD.getDay()] + ", " + prettyDate(tk);

  const otd = $("onThisDay");
  otd.innerHTML = "";
  const tp = parseKey(tk);
  liveMemories().forEach(function(m){
    const mp = parseKey(m.date);
    if(mp.m === tp.m && mp.d === tp.d && tp.y >= mp.y){
      const yrs = tp.y - mp.y;
      let text;
      if(yrs === 0) text = "you planted this memory today: " + m.title;
      else if(yrs === 1) text = "one year " + KIND_WORD[m.kind] + " " + m.title + " 🤍";
      else text = yrs + " years " + KIND_WORD[m.kind] + " " + m.title + " 🤍";
      const div = document.createElement("div");
      div.className = "memory-line";
      div.innerHTML = "<span>" + KIND_ICON[m.kind] + "</span><span>" + esc(text) + "</span>";
      div.onclick = function(){ openModal(m.date); };
      otd.appendChild(div);
    }
  });

  const evBox = $("todayEvents");
  evBox.innerHTML = "";
  liveEvents().filter(function(e){ return e.date === tk; })
    .sort(function(a,b){ return (a.time||"").localeCompare(b.time||""); })
    .forEach(function(e){
      const d = document.createElement("div");
      d.className = "ev";
      d.textContent = "💌 " + (e.time ? e.time + " · " : "") + e.title;
      evBox.appendChild(d);
    });

  const qm = $("quickMoods");
  qm.innerHTML = "";
  const dayData = Store.days[tk] || {};
  MOODS.forEach(function(mo){
    const b = document.createElement("button");
    b.className = "mood-btn" + (dayData.mood === mo.id ? " selected" : "");
    b.textContent = mo.emoji; b.title = mo.label;
    b.onclick = async function(){
      const already = (Store.days[tk] || {}).mood === mo.id;
      await setDay(tk, {mood: already ? null : mo.id});
      if(!already) await addLove(1, "mood");
      renderToday(); renderCalendar();
    };
    qm.appendChild(b);
  });
}

/* ---------- calendar ---------- */
let viewYear, viewMonth;
function marksFor(key){
  const p = parseKey(key);
  let bow = false, mail = false, book = false, mic = false, moodColor = null;
  const dd = Store.days[key];
  if(dd){
    if(dd.note && dd.note.trim()) book = true;
    if(dd.mood){ const mo = MOODS.find(function(m){ return m.id === dd.mood; }); if(mo) moodColor = mo.color; }
  }
  liveMemories().forEach(function(m){
    const mp = parseKey(m.date);
    if(mp.m === p.m && mp.d === p.d && p.y >= mp.y) bow = true;
  });
  if(liveEvents().some(function(e){ return e.date === key; })) mail = true;
  if(liveVoice(key).length) mic = true;
  return {bow:bow, mail:mail, book:book, mic:mic, moodColor:moodColor};
}
function renderCalendar(){
  $("monthTitle").textContent = MONTHS[viewMonth] + " " + viewYear;
  const grid = $("calGrid");
  grid.innerHTML = "";
  const first = new Date(viewYear, viewMonth, 1).getDay();
  const daysIn = new Date(viewYear, viewMonth+1, 0).getDate();
  const tk = todayKey();
  for(let i=0;i<first;i++){
    const e = document.createElement("div"); e.className = "day empty"; grid.appendChild(e);
  }
  for(let d=1; d<=daysIn; d++){
    const key = keyOf(viewYear, viewMonth, d);
    const cell = document.createElement("div");
    cell.className = "day" + (key === tk ? " today" : "");
    const mk = marksFor(key);
    let inner = '<div class="num">' + d + '</div>';
    if(mk.moodColor) inner += '<div class="mood-dot" style="background:' + mk.moodColor + '"></div>';
    let marks = "";
    if(mk.bow) marks += "🎀";
    if(mk.mail) marks += "💌";
    if(mk.book) marks += "📖";
    if(mk.mic) marks += "🎙️";
    if(marks) inner += '<div class="marks">' + marks + '</div>';
    cell.innerHTML = inner;
    cell.onclick = function(){ openModal(key); };
    grid.appendChild(cell);
  }
}

/* ---------- memory garden ---------- */
function renderGarden(){
  const grid = $("gardenGrid");
  const empty = $("gardenEmpty");
  grid.innerHTML = "";
  const mems = liveMemories().slice().sort(function(a,b){ return a.date < b.date ? 1 : -1; });
  empty.style.display = mems.length ? "none" : "";
  const tk = todayKey();
  mems.forEach(function(m){
    const card = document.createElement("div");
    card.className = "mem-card";
    const yrs = yearsBetween(m.date, tk);
    let since;
    if(m.date > tk) since = "a day still to come ✨";
    else if(yrs < 1) since = "planted this year 🌱";
    else if(yrs === 1) since = "one year ago 🤍";
    else since = yrs + " years ago 🤍";
    card.innerHTML =
      '<button class="del" title="let this one go">🍃</button>' +
      '<span class="flower">' + KIND_ICON[m.kind] + '</span>' +
      '<h4>' + esc(m.title) + '</h4>' +
      '<div class="when">' + prettyDate(m.date) + '</div>' +
      '<div class="since">' + since + '</div>';
    card.querySelector(".del").onclick = async function(ev){
      ev.stopPropagation();
      if(confirm("let “" + m.title + "” drift away from the garden?")){
        await removeMemoryRec(m.id);
        renderGarden(); renderCalendar(); renderToday();
      }
    };
    card.onclick = function(){ openModal(m.date); };
    grid.appendChild(card);
  });
}

/* ---------- day modal ---------- */
let modalKey = null;
function openModal(key){
  modalKey = key;
  $("modalTitle").textContent = prettyDate(key);
  const p = parseKey(key);
  $("modalSub").textContent = WDAYS[new Date(p.y,p.m,p.d).getDay()] + (key === todayKey() ? " · that's today 🤍" : "");
  const mm = $("modalMoods");
  mm.innerHTML = "";
  const dd = Store.days[key] || {};
  MOODS.forEach(function(mo){
    const b = document.createElement("button");
    b.className = "mood-btn" + (dd.mood === mo.id ? " selected" : "");
    b.textContent = mo.emoji; b.title = mo.label;
    b.onclick = async function(){
      const already = (Store.days[key] || {}).mood === mo.id;
      await setDay(key, {mood: already ? null : mo.id});
      if(!already) await addLove(1, "mood");
      openModal(key); renderCalendar(); renderToday();
    };
    mm.appendChild(b);
  });
  $("noteBox").value = dd.note || "";
  renderModalLists();
  renderVoiceList();
  $("memTitle").value = ""; $("evTitle").value = ""; $("evTime").value = "";
  stopRecordingUIOnly();
  $("overlay").classList.add("open");
}
function renderModalLists(){
  const key = modalKey;
  const ml = $("memList");
  ml.innerHTML = "";
  liveMemories().filter(function(m){ return m.date === key; }).forEach(function(m){
    const line = document.createElement("div");
    line.className = "item-line";
    line.innerHTML = '<span>' + KIND_ICON[m.kind] + '</span><span class="grow">' + esc(m.title) + '</span>';
    const del = document.createElement("button");
    del.className = "mini-del"; del.textContent = "🍃"; del.title = "let it go";
    del.onclick = async function(){
      await removeMemoryRec(m.id);
      renderModalLists(); renderCalendar(); renderToday();
    };
    line.appendChild(del);
    ml.appendChild(line);
  });
  const el = $("evList");
  el.innerHTML = "";
  liveEvents().filter(function(e){ return e.date === key; })
    .sort(function(a,b){ return (a.time||"").localeCompare(b.time||""); })
    .forEach(function(e){
      const line = document.createElement("div");
      line.className = "item-line";
      line.innerHTML = '<span>💌</span><span class="grow">' + (e.time ? e.time + " · " : "") + esc(e.title) + '</span>';
      const del = document.createElement("button");
      del.className = "mini-del"; del.textContent = "🍃";
      del.onclick = async function(){
        await removeEventRec(e.id);
        renderModalLists(); renderCalendar(); renderToday();
      };
      line.appendChild(del);
      el.appendChild(line);
    });
}
function closeModal(){
  if(recorder && recorder.state === "recording"){ recorder.stop(); }
  $("overlay").classList.remove("open");
  modalKey = null;
}

/* ---------- voice notes ---------- */
let recorder = null;
let recChunks = [];
let recStart = 0;
function pickMime(){
  const cands = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  for(const c of cands){ if(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c; }
  return "";
}
async function toggleRecord(){
  if(recorder && recorder.state === "recording"){ recorder.stop(); return; }
  if(!navigator.mediaDevices || !window.MediaRecorder){
    toast("this browser can't record audio 😢"); return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    const mime = pickMime();
    recorder = mime ? new MediaRecorder(stream, {mimeType:mime}) : new MediaRecorder(stream);
    recChunks = [];
    recStart = Date.now();
    const forKey = modalKey;
    recorder.ondataavailable = function(e){ if(e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = async function(){
      stream.getTracks().forEach(function(t){ t.stop(); });
      const blob = new Blob(recChunks, {type: recorder.mimeType || "audio/webm"});
      const dur = Math.round((Date.now() - recStart)/1000);
      stopRecordingUIOnly();
      if(blob.size < 200){ toast("that one was too tiny to keep 🤍"); return; }
      await addVoiceRec(forKey, blob, blob.type, dur);
      await addLove(2, "voice");
      toast("🎙️ voice note kept safe");
      if(modalKey === forKey) renderVoiceList();
      renderCalendar();
    };
    recorder.start();
    $("recBtn").classList.add("recording");
    $("recBtn").textContent = "⏺️ listening… tap to keep it";
    $("recHint").style.display = "";
  }catch(e){
    toast("i need microphone permission to listen 🤍");
  }
}
function stopRecordingUIOnly(){
  $("recBtn").classList.remove("recording");
  $("recBtn").textContent = "🎙️ hold your thought — tap to record";
  $("recHint").style.display = "none";
}
function fmtDur(s){
  s = s || 0;
  return Math.floor(s/60) + ":" + pad(s%60);
}
function renderVoiceList(){
  const vl = $("voiceList");
  vl.innerHTML = "";
  liveVoice(modalKey)
    .sort(function(a,b){ return a.created_at - b.created_at; })
    .forEach(function(v){
      const line = document.createElement("div");
      line.className = "item-line voice-line";
      const head = document.createElement("div");
      head.style.cssText = "display:flex; align-items:center; gap:8px; width:100%;";
      head.innerHTML = '<span>🎙️</span><span class="grow">' + fmtDur(v.duration) + '</span>';
      const play = document.createElement("button");
      play.className = "btn ghost"; play.style.padding = "4px 12px"; play.textContent = "play ▶";
      play.onclick = async function(){
        const url = await voiceUrl(v.id);
        if(!url){ toast("couldn't fetch this one right now 😢"); return; }
        let audio = line.querySelector("audio");
        if(!audio){
          audio = document.createElement("audio");
          audio.controls = true;
          line.appendChild(audio);
        }
        audio.src = url;
        audio.play();
      };
      const del = document.createElement("button");
      del.className = "mini-del"; del.textContent = "🍃";
      del.onclick = async function(){
        await removeVoiceRec(v.id);
        renderVoiceList(); renderCalendar();
      };
      head.appendChild(play);
      head.appendChild(del);
      line.appendChild(head);
      vl.appendChild(line);
    });
}

/* ---------- settings / cloud ---------- */
function renderSettings(){
  const configured = cloudConfigured();
  $("notConfiguredSection").style.display = configured ? "none" : "";
  $("signinSection").style.display = (configured && !sbUser) ? "" : "none";
  $("signedinSection").style.display = (configured && sbUser) ? "" : "none";
  if(sbUser) $("whoLine").textContent = "signed in as " + sbUser.email + " — your memories back up automatically ☁️🤍";
  $("cloudStatusLine").textContent = !configured ? "everything currently lives safely on this device"
    : sbUser ? "backed up to your private cloud" : "sign in to back up your memories";
}
function renderSyncPill(status){
  const pill = $("syncPill");
  const map = {off:"on device", signedout:"on device", syncing:"syncing…", synced:"backed up ☁️", error:"sync hiccup"};
  pill.textContent = map[status] || "on device";
  pill.classList.toggle("on", status === "synced");
}

/* ---------- little joys ---------- */
let toastTimer = null;
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 2600);
}
function sparkleBurst(){
  const emojis = ["✨","🎀","🌸","💗","⭐"];
  const cx = window.innerWidth/2, cy = window.innerHeight/2;
  for(let i=0;i<10;i++){
    const s = document.createElement("div");
    s.className = "sparkle";
    s.textContent = emojis[Math.floor(Math.random()*emojis.length)];
    s.style.left = cx + "px"; s.style.top = cy + "px";
    s.style.setProperty("--dx", (Math.random()*260-130) + "px");
    s.style.setProperty("--dy", (Math.random()*200-140) + "px");
    document.body.appendChild(s);
    setTimeout(function(){ s.remove(); }, 950);
  }
}

/* ---------- events wiring ---------- */
function wire(){
  $("tabCal").onclick = function(){ switchView("cal"); };
  $("tabGarden").onclick = function(){ switchView("garden"); };
  $("prevBtn").onclick = function(){ changeMonth(-1); };
  $("nextBtn").onclick = function(){ changeMonth(1); };
  $("todayBtn").onclick = function(){
    const t = new Date(); viewYear = t.getFullYear(); viewMonth = t.getMonth(); renderCalendar();
  };
  $("closeModalBtn").onclick = closeModal;
  $("overlay").onclick = function(e){ if(e.target === this) closeModal(); };
  $("settingsBtn").onclick = function(){ renderSettings(); $("settingsOverlay").classList.add("open"); };
  $("closeSettingsBtn").onclick = function(){ $("settingsOverlay").classList.remove("open"); };
  $("settingsOverlay").onclick = function(e){ if(e.target === this) this.classList.remove("open"); };
  $("saveNoteBtn").onclick = async function(){
    const v = $("noteBox").value;
    const hadNote = !!((Store.days[modalKey] || {}).note || "").trim();
    await setDay(modalKey, {note:v});
    if(v.trim() && !hadNote) await addLove(2, "note");
    toast("📖 page kept safe");
    renderCalendar();
  };
  $("addMemBtn").onclick = async function(){
    const t = $("memTitle").value.trim();
    if(!t){ toast("give your special day a little name first 🤍"); return; }
    await addMemoryRec(modalKey, t, $("memKind").value);
    $("memTitle").value = "";
    await addLove(3, "memory");
    toast("🌷 planted in the memory garden");
    sparkleBurst();
    renderModalLists(); renderCalendar(); renderToday();
  };
  $("addEvBtn").onclick = async function(){
    const t = $("evTitle").value.trim();
    if(!t){ toast("what shall we tuck in? 💌"); return; }
    await addEventRec(modalKey, $("evTime").value, t);
    $("evTitle").value = ""; $("evTime").value = "";
    toast("💌 tucked into your calendar");
    renderModalLists(); renderCalendar(); renderToday();
  };
  $("recBtn").onclick = toggleRecord;
  $("companionName").onclick = async function(){
    const n = prompt("what shall we call your little friend?", Store.companion.name);
    if(n && n.trim()){ await setCompanion({name:n.trim().slice(0,20)}); renderCompanion(); chirp("greet"); }
  };
  $("greeting").onclick = async function(){
    const n = prompt("what should i call you? 🤍", Store.profile.name);
    if(n && n.trim()){ await setProfileName(n.trim().slice(0,30)); renderToday(); }
  };
  $("signInBtn").onclick = async function(){
    const email = $("emailBox").value.trim();
    if(!email || email.indexOf("@") < 0){ toast("that email looks a little shy — try again 🤍"); return; }
    const r = await cloudSignIn(email);
    if(r.error){ toast("hmm: " + r.error.message); }
    else{ toast("✨ magic link sent — check your email!"); }
  };
  $("signOutBtn").onclick = async function(){
    await cloudSignOut();
    renderSettings(); toast("signed out — memories stay on this device 🤍");
  };
  $("syncNowBtn").onclick = function(){ syncNow(); toast("syncing ☁️"); };
  document.addEventListener("keydown", function(e){ if(e.key === "Escape"){ closeModal(); $("settingsOverlay").classList.remove("open"); } });
}
function switchView(v){
  $("calPanel").style.display = v === "cal" ? "" : "none";
  $("gardenPanel").style.display = v === "garden" ? "" : "none";
  $("tabCal").classList.toggle("active", v === "cal");
  $("tabGarden").classList.toggle("active", v === "garden");
  if(v === "garden") renderGarden();
}
function changeMonth(dir){
  viewMonth += dir;
  if(viewMonth < 0){ viewMonth = 11; viewYear--; }
  if(viewMonth > 11){ viewMonth = 0; viewYear++; }
  renderCalendar();
}

/* re-render after cloud pulls fresh data */
window.onStoreChanged = function(){
  renderCompanion(); renderToday(); renderCalendar();
  if($("gardenPanel").style.display !== "none") renderGarden();
  if(modalKey){ renderModalLists(); renderVoiceList(); }
};

/* ---------- boot ---------- */
(async function boot(){
  await storeLoad();
  const t = new Date();
  viewYear = t.getFullYear(); viewMonth = t.getMonth();
  wire();
  renderCompanion();
  chirp("greet");
  renderToday();
  renderCalendar();
  onSyncStatus = renderSyncPill;
  cloudInit();
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(function(){});
  }
})();
