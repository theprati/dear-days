// ============================================================
// dear days — companion-logic.js
// Pure rules for Mochi's journey: growth stages, feeding,
// treats, habits. No storage, no DOM — just decisions.
// Both api.js and the UI import from here so the rules live
// in exactly one place.
//
// PHILOSOPHY: no hunger, no decay, no guilt. Mochi never
// suffers when Naira is away. Quiet days are just quiet.
// Only celebrations.
// ============================================================

/* ---- life stages (visuals + habits per stage) ----
   `asset` is the image the UI should show. Drop stage art into
   /assets with these names; until a stage image exists the UI
   falls back to assets/mochi.png. */
export const STAGES = [
  {
    key: "sprout", label: "baby mochi", min: 0, size: 0.72,
    asset: "assets/mochi-sprout.png",
    habits: { tailWag: "tiny flicks", naps: "constantly", spot: "curled in the corner of the companion card" },
  },
  {
    key: "kitten", label: "little kitten", min: 30, size: 0.84,
    asset: "assets/mochi-kitten.png",
    habits: { tailWag: "quick happy wags", naps: "often", spot: "chasing sparkles near the mood picker" },
  },
  {
    key: "soft", label: "soft kitty", min: 80, size: 0.94,
    asset: "assets/mochi-soft.png",
    habits: { tailWag: "slow content sways", naps: "afternoons", spot: "tail peeking from behind the calendar" },
  },
  {
    key: "fluffy", label: "fluffy kitty", min: 160, size: 1.0,
    asset: "assets/mochi-fluffy.png",
    habits: { tailWag: "grand swishes", naps: "in sunbeams", spot: "food bowl visible beside the today card" },
  },
  {
    key: "cloud", label: "cloud cat", min: 280, size: 1.08,
    asset: "assets/mochi-cloud.png",
    habits: { tailWag: "levitating curl", naps: "on a tiny cloud", spot: "floating higher, faint sparkle trail" },
  },
];

/* ---- how care is earned ---- */
export const POINTS = {
  mood: 1,          // picking a mood for a day
  note: 3,          // writing (or dictating) a diary page
  memory: 4,        // planting a special day
  dayComplete: 2,   // bonus: a day that has BOTH mood + page  → feeding moment
  treat: 6,         // bonus when a treat is earned
};

/* a treat every N diary pages (pages with real text) */
export const TREAT_EVERY = 5;

export function stageFor(points) {
  let s = STAGES[0], idx = 0;
  STAGES.forEach((st, i) => { if (points >= st.min) { s = st; idx = i; } });
  return { ...s, index: idx, count: STAGES.length };
}
export function nextStage(points) {
  const cur = stageFor(points);
  return cur.index < STAGES.length - 1 ? STAGES[cur.index + 1] : null;
}
export function progressPct(points) {
  const cur = stageFor(points), nxt = nextStage(points);
  if (!nxt) return 100;
  return Math.min(100, Math.round(((points - cur.min) / (nxt.min - cur.min)) * 100));
}

/* count diary pages that actually hold words */
export function countDiaryEntries(days) {
  let n = 0;
  for (const k in days) if (days[k] && days[k].note && days[k].note.trim()) n++;
  return n;
}

/* ============================================================
   evaluateDaySave — THE core rule.
   Called when a day's record is saved. Decides which care
   events happened, so the UI can play the right animations
   and the backend can persist points/treats.

   input:
     prev: { mood, note }        day's record BEFORE the save
     next: { mood, note }        day's record AFTER the save
     entriesBefore: number       diary pages (with text) before
     treatsGiven: number         treats given so far, ever
     lovePoints: number          current points

   returns: { events: [...], pointsDelta, treatsDelta }
     events (in play order), each { type, ... }:
       { type:"mood" }                       – small sparkle
       { type:"page" }                       – page tucked in
       { type:"fed" }                        – FEEDING ANIMATION (bowl!)
       { type:"treat", n }                   – treat animation
       { type:"grew", from, to }             – evolution moment
   ============================================================ */
export function evaluateDaySave({ prev, next, entriesBefore, treatsGiven, lovePoints }) {
  const events = [];
  let delta = 0;

  const hadMood = !!(prev && prev.mood);
  const hasMood = !!(next && next.mood);
  const hadNote = !!(prev && prev.note && prev.note.trim());
  const hasNote = !!(next && next.note && next.note.trim());

  if (!hadMood && hasMood) { events.push({ type: "mood" }); delta += POINTS.mood; }
  if (!hadNote && hasNote) { events.push({ type: "page" }); delta += POINTS.note; }

  // feeding: the first time a day becomes "complete" (mood AND page)
  const wasComplete = hadMood && hadNote;
  const isComplete = hasMood && hasNote;
  if (!wasComplete && isComplete) { events.push({ type: "fed" }); delta += POINTS.dayComplete; }

  // treats: every TREAT_EVERY diary pages
  const entriesAfter = entriesBefore + (!hadNote && hasNote ? 1 : 0);
  const treatsEarned = Math.floor(entriesAfter / TREAT_EVERY);
  let treatsDelta = 0;
  if (treatsEarned > treatsGiven) {
    treatsDelta = treatsEarned - treatsGiven;
    events.push({ type: "treat", n: treatsEarned });
    delta += POINTS.treat * treatsDelta;
  }

  // growth: did the points cross a stage boundary?
  const before = stageFor(lovePoints);
  const after = stageFor(lovePoints + delta);
  if (after.index > before.index) {
    events.push({ type: "grew", from: before.key, to: after.key, toLabel: after.label });
  }

  return { events, pointsDelta: delta, treatsDelta };
}

/* same idea for planting a memory */
export function evaluateMemoryPlant({ lovePoints }) {
  const events = [{ type: "memory" }];
  const delta = POINTS.memory;
  const before = stageFor(lovePoints), after = stageFor(lovePoints + delta);
  if (after.index > before.index) events.push({ type: "grew", from: before.key, to: after.key, toLabel: after.label });
  return { events, pointsDelta: delta };
}

/* what Mochi says at each moment (UI picks randomly) */
export const REACTIONS = {
  mood:  ["noted in my little heart 💗", "whatever you feel is okay with me 🖤"],
  page:  ["a new page! i love page days 🖤", "*presses it flat like a flower* kept."],
  fed:   ["*munch munch* you fed me by feeding your heart 🖤", "a whole day, remembered. yum."],
  treat: ["A TREAT!! *spins* thank you thank you 🖤", "*crunch* …i am saving half for you."],
  grew:  ["!!! look at me. all your little days made me BIGGER 🖤", "i grew because you kept showing up 🎀"],
  memory:["a new keepsake! i will guard it 🖤"],
};
