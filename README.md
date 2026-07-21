# Fortnite Drivers Hub — Firebase setup

## 1. Create the Firebase project
1. Go to console.firebase.google.com → **Add project** → name it, finish setup (Google Analytics optional, skip it if unsure).
2. In the left sidebar: **Build → Authentication** → **Get started** → enable the **Email/Password** provider.
3. In the left sidebar: **Build → Firestore Database** → **Create database** → start in **production mode** → pick a region close to you.

## 2. Apply the security rules
1. Firestore Database → **Rules** tab.
2. Delete what's there, paste in everything from `firestore.rules`.
3. **Publish**.

These rules are what enforce: drivers can only edit their own profile/stats, resubmitted stats always land back at "pending" (no self-approval), and only admins can approve stats, add promotions, manage the league/track directories, etc. — same protections as before, just written in Firestore's rules language instead of Postgres.

## 3. Connect the site
1. Project Settings (gear icon) → scroll to **Your apps** → click the `</>` (web) icon → register an app (nickname doesn't matter, skip hosting).
2. Copy the `firebaseConfig` object it gives you.
3. Open `assets/app.js`, find this block near the top, and paste your real values in:
   ```js
   const FIREBASE_CONFIG = {
     apiKey: 'YOUR_API_KEY',
     authDomain: 'YOUR_PROJECT.firebaseapp.com',
     projectId: 'YOUR_PROJECT_ID',
     storageBucket: 'YOUR_PROJECT.appspot.com',
     messagingSenderId: 'YOUR_SENDER_ID',
     appId: 'YOUR_APP_ID'
   };
   ```

## 4. Host it (GitHub Pages)
1. New GitHub repo.
2. Upload everything **inside** this folder (not the folder itself) to the repo root — `index.html`, `rankings.html`, `stats.html`, `awards.html`, `directory.html`, `dashboard.html`, `admin.html`, the `assets/` folder, the `worker/` folder, `firestore.rules`.
3. Repo → Settings → Pages → Deploy from branch → `main` / root.
4. Live at `https://yourusername.github.io/reponame/`.

## 5. Make yourself admin
1. Register a driver account on the live site.
2. Firebase console → Firestore Database → Data tab → `profiles` collection → find your document (the ID is your Firebase user's UID — click Authentication → Users to match your email to the right UID).
3. Edit the document → set `is_admin` to `true` (boolean, not string) → Save.
4. Refresh the site, log in — you'll now see the admin panel at the bottom of `admin.html`.

## 6. Discord-role admin sync (optional)
Since Firebase doesn't have a built-in "Log in with Discord" option the way Supabase did, this works a little differently now: **you (an existing admin) trigger it manually** from the admin panel, instead of it happening automatically when someone logs in.

**A. Get your Discord bot token, server ID, and admin role ID**
1. Enable Developer Mode in Discord (Settings → Advanced).
2. Right-click your server icon → Copy Server ID → `DISCORD_GUILD_ID`.
3. Right-click your admin role → Copy Role ID → `ADMIN_ROLE_ID`.
4. Your existing bot's token from the Discord Developer Portal (Bot page) → `DISCORD_BOT_TOKEN`.
5. Make sure the bot is actually in your server and has the **Server Members Intent** enabled.

**B. Deploy the Worker**
```
cd worker
wrangler secret put DISCORD_BOT_TOKEN
```
Edit `wrangler.toml` — fill in `DISCORD_GUILD_ID`, `ADMIN_ROLE_ID`, and `ALLOWED_ORIGIN` (your GitHub Pages URL). Then:
```
wrangler deploy
```
Copy the deployed `*.workers.dev` URL into `DISCORD_ROLE_CHECK_WORKER_URL` near the top of `assets/app.js`.

**How to use it:** on `admin.html`, in the driver table, type a driver's Discord ID into the "Discord ID" box for their row, then click "Sync admin". The Worker checks their live role in your server; if they have the admin role, their `is_admin` flag flips to true immediately (and flips back to false if you remove the role and re-sync).

## What's in it
- **7 core pages** plus **`compare.html`** (new) sharing `assets/styles.css` and `assets/app.js`.
- **Redesigned driver license card** — now laid out like an actual ID: photo box, header with issuer/tier, labeled fields (Callsign, License No., Nationality, Epic Username), a barcode strip, and a signature-style callsign. Used on the homepage hero (placeholder), `dashboard.html` (your own, editable), and `driver.html` (public view).
- **Download license as image** — button on `dashboard.html` and `driver.html`, renders the card to a PNG using html2canvas (loaded via CDN on those two pages only).
- **Search + sortable columns** — on the Driver Catalogue (`rankings.html`) and Driver Stats (`stats.html`): type to filter by callsign, click any column header to sort by it (click again to reverse).
- **Driver Comparison** (`compare.html`) — pick any two drivers, see their license info and race stats side by side, with the higher value highlighted per row.
- **Driver Spotlight** — homepage card featuring a random driver on each visit, with a link to their full profile.
- **Add to Home Screen (PWA)** — `manifest.json` + `sw.js` (service worker) + generated app icons let visitors install the site like an app on their phone. Firebase/Firestore requests always go straight to the network — only the static site shell (HTML/CSS/JS/icons) gets cached, so driver data is never stale.
- Everything from before: registration, login, promotions, awards, league/track directories, track makers, admin panel, driver stats approval, avatar + driver number self-editing, Discord admin sync.

**Note on Firestore queries:** the catalogue and stats tables now fetch all data once and sort/filter entirely in the browser (instead of asking Firestore to pre-sort), so you no longer strictly need the `driver_stats (status, wins)` composite index from earlier — it won't hurt to leave it, just flagging it's no longer required.

## Note on the earlier Supabase version
This site was originally built on Supabase and worked end-to-end — the switch to Firebase was a deliberate choice, not a fix for a Supabase problem. If anything comes up that feels harder than it should, that's the NoSQL/Firestore model (no joins, security rules instead of SQL policies) being a genuinely different shape than what came before, not a sign something's broken.
