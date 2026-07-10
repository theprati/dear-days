# Dear Days 🎀

A soft little keeper of your moments — calendar-diary PWA with a companion bunny,
memory garden, moods, voice notes, on-device storage (IndexedDB) and optional
private cloud backup (Supabase).

## Files

| file | what it is |
|---|---|
| `index.html` | the app shell |
| `styles.css` | placeholder skin — swap freely when the new design is ready |
| `app.js` | UI logic |
| `storage.js` | IndexedDB local storage + Supabase sync engine |
| `config.js` | Supabase URL + anon key (empty = on-device only) |
| `sw.js` / `manifest.json` / `icon-*.png` | PWA install + offline |
| `supabase-setup.sql` | run once in Supabase SQL Editor |

## Setup — GitHub Pages (hosting, free)

1. Create a repository on GitHub (e.g. `dear-days`), upload all files in this folder.
2. Repo → Settings → Pages → Source: `main` branch, `/ (root)` → Save.
3. Your app is live at `https://<username>.github.io/dear-days/` in ~1 minute.

## Setup — Supabase (cloud backup, free)

1. supabase.com → sign in with GitHub → New project (any name, free plan).
2. SQL Editor → paste all of `supabase-setup.sql` → Run.
3. Project Settings → API → copy the Project URL and the `anon public` key
   into `config.js`, commit the change.
4. Authentication → URL Configuration → set Site URL to your GitHub Pages URL.
5. In the app: ☁️ → enter your email → tap the magic link it sends you. Done —
   everything backs up automatically from then on.

## Install on iPhone

Open the GitHub Pages URL in **Safari** → Share button → **Add to Home Screen**.
It becomes its own full-screen app icon — no browser chrome. Voice notes need
mic permission the first time you record.

## Notes

- Works fully offline; cloud sync catches up when you're back online.
- Without cloud sign-in, everything stays in the phone's app storage.
- The anon key in `config.js` is safe to publish — data is protected per-user
  by Row Level Security; nobody can read your rows without your email login.
