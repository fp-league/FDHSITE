// ============================================================
// FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCiSBnzmcPtVjYVdCMCUKDbMeDvMMQX3Fg",
  authDomain: "fornite-drivers-hub.firebaseapp.com",
  projectId: "fornite-drivers-hub",
  storageBucket: "fornite-drivers-hub.firebasestorage.app",
  messagingSenderId: "137210171773",
  appId: "1:137210171773:web:92034bc2c3a35437c8bc14",
  measurementId: "G-Z0SY4FV3W5"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Cloudflare Worker that checks a Discord user's live role (admin only, manual trigger — see admin panel)
const DISCORD_ROLE_CHECK_WORKER_URL = 'https://fdh-admin-sync.YOUR_SUBDOMAIN.workers.dev';

let currentUser = null;
let currentProfile = null;

// Safely gets an element, or null if this page doesn't have that section
function $(id){ return document.getElementById(id); }

// ---------- Modal handling ----------
function openModal(mode){
  document.getElementById('authModal').classList.add('open');
  switchModal(mode);
}
function closeModal(){
  document.getElementById('authModal').classList.remove('open');
}
function switchModal(mode){
  document.getElementById('registerForm').classList.toggle('hidden', mode !== 'register');
  document.getElementById('loginForm').classList.toggle('hidden', mode !== 'login');
}

// ---------- Auth ----------
async function register(){
  const callsign = document.getElementById('regCallsign').value.trim();
  const epic = document.getElementById('regEpic').value.trim();
  const country = document.getElementById('regCountry').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const msg = document.getElementById('regMsg');
  msg.className = 'form-msg';
  msg.textContent = '';

  if(!callsign || !epic || !email || !password){
    msg.textContent = 'Fill in every field.'; msg.className = 'form-msg error'; return;
  }

  let userCredential;
  try{
    userCredential = await auth.createUserWithEmailAndPassword(email, password);
  } catch(error){
    msg.textContent = error.message; msg.className = 'form-msg error'; return;
  }

  const uid = userCredential.user.uid;

  try{
    // assign next driver number
    const countSnap = await db.collection('profiles').get();
    const driverNumber = countSnap.size + 1;

    await db.collection('profiles').doc(uid).set({
      callsign,
      epic_username: epic,
      country,
      driver_number: driverNumber,
      tier: 'rookie',
      power_points: 0,
      is_admin: false,
      discord_id: '',
      created_at: new Date().toISOString()
    });
  } catch(error){
    msg.textContent = error.message; msg.className = 'form-msg error'; return;
  }

  msg.textContent = 'Account created! You can log in now.';
  msg.className = 'form-msg ok';
}

async function login(){
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const msg = document.getElementById('loginMsg');
  msg.className = 'form-msg'; msg.textContent = '';

  try{
    await auth.signInWithEmailAndPassword(email, password);
  } catch(error){
    msg.textContent = error.message; msg.className = 'form-msg error'; return;
  }

  closeModal();
}

async function logout(){
  await auth.signOut();
}

async function refreshSession(user){
  currentUser = user || null;

  if(currentUser){
    const doc = await db.collection('profiles').doc(currentUser.uid).get();
    currentProfile = doc.exists ? { id: doc.id, ...doc.data() } : null;
    if(currentProfile) loadMyStats();
  } else {
    currentProfile = null;
  }

  renderAuthState();
  loadPromotions();
  loadRankings();
  loadCatalogue();
  loadPublicStats();
  loadAwards();
  loadDirectories();
  loadTrackMakers();
  loadCompareSelects();
  loadSpotlight();
  if(currentProfile && currentProfile.is_admin) loadAdminData();
}

function renderAuthState(){
  const nav = $('navActions');
  const loggedOut = $('loggedOutView');
  const dash = $('dashboardView');
  const admin = $('adminView');

  if(currentUser && currentProfile){
    if(nav) nav.innerHTML = `<span class="mono" style="color:var(--dim); font-size:13px;">${currentProfile.callsign}</span>`;
    if(loggedOut) loggedOut.classList.add('hidden');
    if(dash){
      dash.classList.remove('hidden');
      if($('dashCallsign')) $('dashCallsign').textContent = currentProfile.callsign;
      if($('dashEpic')) $('dashEpic').textContent = currentProfile.epic_username;
      if($('dashTier')) $('dashTier').textContent = currentProfile.tier;
      if($('dashNumber')) $('dashNumber').textContent = '#' + String(currentProfile.driver_number).padStart(3,'0');
      if($('dashCountry')) $('dashCountry').textContent = currentProfile.country || '—';
      if($('dashSignature')) $('dashSignature').textContent = currentProfile.callsign;
      if($('dashAvatar')){
        const img = $('dashAvatar');
        const fallback = $('dashPhotoFallback');
        if(currentProfile.avatar_url){
          img.src = currentProfile.avatar_url; img.style.display = 'block';
          if(fallback) fallback.style.display = 'none';
        } else {
          img.style.display = 'none';
          if(fallback){ fallback.style.display = 'flex'; fallback.textContent = (currentProfile.callsign || '?').charAt(0).toUpperCase(); }
        }
      }
      if($('custAvatarUrl')) $('custAvatarUrl').value = currentProfile.avatar_url || '';
      if($('custDriverNumber')) $('custDriverNumber').value = currentProfile.driver_number || '';
    }
    if(admin) admin.classList.toggle('hidden', !currentProfile.is_admin);
  } else {
    if(nav) nav.innerHTML = `
      <button class="btn btn-ghost" onclick="openModal('login')">Log in</button>
      <button class="btn btn-primary" onclick="openModal('register')">Register as Driver</button>`;
    if(loggedOut) loggedOut.classList.remove('hidden');
    if(dash) dash.classList.add('hidden');
    if(admin) admin.classList.add('hidden');
  }

  // Per-page "log in to see this" / "admins only" messages
  const isLoggedIn = !!(currentUser && currentProfile);
  const isAdmin = !!(currentUser && currentProfile && currentProfile.is_admin);

  const loggedOutStatsMsg = $('loggedOutStatsMsg');
  const myStatsForm = $('myStatsForm');
  if(loggedOutStatsMsg && myStatsForm){
    loggedOutStatsMsg.classList.toggle('hidden', isLoggedIn);
    myStatsForm.classList.toggle('hidden', !isLoggedIn);
  }

  const loggedOutDashMsg = $('loggedOutDashMsg');
  if(loggedOutDashMsg) loggedOutDashMsg.classList.toggle('hidden', isLoggedIn);

  const notAdminMsg = $('notAdminMsg');
  if(notAdminMsg) notAdminMsg.classList.toggle('hidden', isAdmin);
}

// ---------- Promotions (public) ----------
async function loadPromotions(){
  if(!$('leaguePromoList')) return;

  const snap = await db.collection('promotions').where('active', '==', true).orderBy('created_at', 'desc').get();
  const promos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const leagueList = document.getElementById('leaguePromoList');
  const serverList = document.getElementById('serverPromoList');
  leagueList.innerHTML = '';
  serverList.innerHTML = '';

  const league = promos.filter(p => p.type === 'league');
  const server = promos.filter(p => p.type === 'server');

  leagueList.innerHTML = league.length
    ? league.map(p => `
        <div class="promo-card">
          <h4>${p.title}</h4>
          <div class="promo-desc">${p.description || ''}</div>
        </div>`).join('')
    : `<div class="promo-empty">No active league promotions right now.</div>`;

  serverList.innerHTML = server.length
    ? server.map(p => `
        <div class="promo-card server">
          <h4>${p.title}</h4>
          <div class="promo-desc">${p.description || ''}</div>
        </div>`).join('')
    : `<div class="promo-empty">No active server promotions right now.</div>`;

  updateTicker(league, server);
}

// ---------- Live ticker ----------
function updateTicker(league, server){
  const track = document.getElementById('tickerTrack');
  const items = [...league.map(p => `LEAGUE — ${p.title}`), ...server.map(p => `SERVER — ${p.title}`)];
  if(!items.length){
    track.innerHTML = `<span class="ticker-item"><span class="live-dot"></span>Grid open — registration live</span>`;
    return;
  }
  const html = items.map(t => `<span class="ticker-item"><span class="live-dot"></span>${t}</span>`).join('');
  track.innerHTML = html + html; // duplicate for seamless loop
}

// ---------- Driver rankings (podium + top 50) ----------
async function loadRankings(){
  if(!$('podium')) return;

  const snap = await db.collection('profiles').orderBy('power_points', 'desc').limit(50).get();
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const podiumEl = document.getElementById('podium');
  const top3 = [list[1], list[0], list[2]]; // display order: 2nd, 1st, 3rd
  const spotClasses = ['p2','p1','p3'];
  podiumEl.innerHTML = top3.map((d, i) => {
    if(!d) return '';
    const pos = i === 1 ? 1 : (i === 0 ? 2 : 3);
    return `
      <div class="podium-spot ${spotClasses[i]}">
        <div class="podium-card">
          <div class="podium-pos">#${pos}</div>
          <div class="podium-name"><a href="driver.html?id=${d.id}" class="driver-link">${d.callsign}</a></div>
          <div class="podium-points"><span class="cu" data-target="${d.power_points}">0</span> pts</div>
        </div>
        <div class="podium-base"></div>
      </div>`;
  }).join('');
  podiumEl.querySelectorAll('.cu').forEach(el => countUp(el, parseInt(el.dataset.target) || 0));

  const boardEl = document.getElementById('leaderboardList');
  const rest = list.slice(3);
  boardEl.innerHTML = rest.map((d, i) => `
    <div class="leaderboard-row">
      <div class="lb-pos">#${i + 4}</div>
      <div class="lb-name"><a href="driver.html?id=${d.id}" class="driver-link">${d.callsign}</a><span class="num">#${String(d.driver_number).padStart(3,'0')}</span></div>
      <div class="lb-points">${d.power_points} pts</div>
    </div>`).join('');
}

// ---------- Driver stats (public approved table) ----------
let publicStatsList = [];
let statsSort = { field: 'wins', dir: 'desc' };

async function loadPublicStats(){
  if(!$('statsBody')) return;

  const snap = await db.collection('driver_stats').where('status', '==', 'approved').get();
  publicStatsList = snap.docs.map(d => {
    const data = { id: d.id, ...d.data() };
    data.winPct = data.races > 0 ? Math.round((data.wins / data.races) * 100) : 0;
    return data;
  });
  renderPublicStats();
}

function sortStats(field){
  if(statsSort.field === field){
    statsSort.dir = statsSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    statsSort.field = field;
    statsSort.dir = field === 'callsign' ? 'asc' : 'desc';
  }
  renderPublicStats();
}

function renderPublicStats(){
  const body = document.getElementById('statsBody');
  const empty = document.getElementById('statsEmpty');
  if(!body) return;

  const searchEl = $('statsSearch');
  const term = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let list = term ? publicStatsList.filter(s => (s.callsign || '').toLowerCase().includes(term)) : [...publicStatsList];

  if(!publicStatsList.length){
    body.innerHTML = '';
    if(empty) empty.classList.remove('hidden');
    return;
  }
  if(empty) empty.classList.add('hidden');

  const { field, dir } = statsSort;
  list.sort((a, b) => {
    let av = a[field], bv = b[field];
    if(typeof av === 'string'){ av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
    if(av < bv) return dir === 'asc' ? -1 : 1;
    if(av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  document.querySelectorAll('#statsSection th.sortable').forEach(th => {
    th.classList.remove('sort-active', 'sort-asc', 'sort-desc');
    if(th.getAttribute('onclick') === `sortStats('${field}')`){
      th.classList.add('sort-active', dir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });

  body.innerHTML = '';
  if(!list.length){
    body.innerHTML = `<tr><td colspan="8" style="color:var(--dim); text-align:center; padding:20px;">No drivers match your search.</td></tr>`;
    return;
  }
  list.forEach(s => {
    body.innerHTML += `
      <tr>
        <td><a href="driver.html?id=${s.id}" class="driver-link">${s.callsign || '—'}</a></td>
        <td>${s.races}</td>
        <td>${s.wins}</td>
        <td>${s.podiums}</td>
        <td>${s.poles}</td>
        <td>${s.wcc}</td>
        <td>${s.wdc}</td>
        <td class="win-pct">${s.winPct}%</td>
      </tr>`;
  });
}

// ---------- Your own stats submission ----------
async function loadMyStats(){
  if(!currentUser) return;
  if(!$('myStatStatus')) return;

  const doc = await db.collection('driver_stats').doc(currentUser.uid).get();
  const statusEl = document.getElementById('myStatStatus');

  if(doc.exists){
    const mine = doc.data();
    document.getElementById('statRaces').value = mine.races;
    document.getElementById('statWins').value = mine.wins;
    document.getElementById('statPodiums').value = mine.podiums;
    document.getElementById('statPoles').value = mine.poles;
    document.getElementById('statWcc').value = mine.wcc;
    document.getElementById('statWdc').value = mine.wdc;

    const labels = { approved:'Approved', pending:'Pending review', rejected:'Rejected — resubmit anytime' };
    statusEl.innerHTML = `<div class="stat-status ${mine.status}"><span class="dot"></span>${labels[mine.status]}</div>`;
  } else {
    statusEl.innerHTML = '';
    ['statRaces','statWins','statPodiums','statPoles','statWcc','statWdc'].forEach(id => document.getElementById(id).value = 0);
  }
}

async function submitMyStats(){
  const msg = document.getElementById('statMsg');
  msg.className = 'form-msg'; msg.textContent = '';
  if(!currentUser || !currentProfile) return;

  const payload = {
    callsign: currentProfile.callsign, // denormalized so the public table doesn't need a join
    races: parseInt(document.getElementById('statRaces').value) || 0,
    wins: parseInt(document.getElementById('statWins').value) || 0,
    podiums: parseInt(document.getElementById('statPodiums').value) || 0,
    poles: parseInt(document.getElementById('statPoles').value) || 0,
    wcc: parseInt(document.getElementById('statWcc').value) || 0,
    wdc: parseInt(document.getElementById('statWdc').value) || 0,
    status: 'pending',
    submitted_at: new Date().toISOString()
  };

  try{
    await db.collection('driver_stats').doc(currentUser.uid).set(payload, { merge: true });
  } catch(error){
    msg.textContent = error.message; msg.className = 'form-msg error'; return;
  }

  msg.textContent = 'Submitted — waiting on admin approval.';
  msg.className = 'form-msg ok';
  loadMyStats();
}

// ---------- Profile customization (avatar + driver number) ----------
async function saveProfileCustomization(){
  const msg = document.getElementById('custMsg');
  msg.className = 'form-msg'; msg.textContent = '';
  if(!currentUser || !currentProfile) return;

  const avatarUrl = document.getElementById('custAvatarUrl').value.trim();
  const numberInput = document.getElementById('custDriverNumber').value.trim();
  const newNumber = parseInt(numberInput);

  if(!numberInput || isNaN(newNumber) || newNumber < 1){
    msg.textContent = 'Enter a valid driver number (1 or higher).';
    msg.className = 'form-msg error';
    return;
  }

  if(avatarUrl && !/^https?:\/\//i.test(avatarUrl)){
    msg.textContent = 'Avatar must be a valid image URL (starting with http:// or https://).';
    msg.className = 'form-msg error';
    return;
  }

  // Check the number isn't already taken by someone else
  if(newNumber !== currentProfile.driver_number){
    const clash = await db.collection('profiles').where('driver_number', '==', newNumber).get();
    const takenByOther = clash.docs.some(d => d.id !== currentUser.uid);
    if(takenByOther){
      msg.textContent = `Driver #${newNumber} is already taken — pick another.`;
      msg.className = 'form-msg error';
      return;
    }
  }

  try{
    await db.collection('profiles').doc(currentUser.uid).update({
      avatar_url: avatarUrl,
      driver_number: newNumber
    });
  } catch(error){
    msg.textContent = error.message; msg.className = 'form-msg error'; return;
  }

  currentProfile.avatar_url = avatarUrl;
  currentProfile.driver_number = newNumber;
  renderAuthState();

  msg.textContent = 'Saved!';
  msg.className = 'form-msg ok';
}

// ---------- Driver catalogue / power rankings ----------
let catalogueDrivers = [];
let catalogueSort = { field: 'power_points', dir: 'desc' };

async function loadCatalogue(){
  if(!$('catalogueBody')) return;

  const snap = await db.collection('profiles').get();
  catalogueDrivers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderCatalogue();
}

function sortCatalogue(field){
  if(catalogueSort.field === field){
    catalogueSort.dir = catalogueSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    catalogueSort.field = field;
    catalogueSort.dir = (field === 'callsign' || field === 'country' || field === 'tier') ? 'asc' : 'desc';
  }
  renderCatalogue();
}

function renderCatalogue(){
  const body = document.getElementById('catalogueBody');
  if(!body) return;

  const searchEl = $('catalogueSearch');
  const term = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let list = term ? catalogueDrivers.filter(d => (d.callsign || '').toLowerCase().includes(term)) : [...catalogueDrivers];

  const { field, dir } = catalogueSort;
  list.sort((a, b) => {
    let av = a[field], bv = b[field];
    if(typeof av === 'string'){ av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
    if(av == null) av = typeof bv === 'string' ? '' : 0;
    if(bv == null) bv = typeof av === 'string' ? '' : 0;
    if(av < bv) return dir === 'asc' ? -1 : 1;
    if(av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  document.querySelectorAll('#catalogueSection th.sortable').forEach(th => {
    th.classList.remove('sort-active', 'sort-asc', 'sort-desc');
    if(th.getAttribute('onclick') === `sortCatalogue('${field}')`){
      th.classList.add('sort-active', dir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });

  body.innerHTML = '';
  if(!list.length){
    body.innerHTML = `<tr><td colspan="6" style="color:var(--dim); text-align:center; padding:20px;">No drivers match your search.</td></tr>`;
    return;
  }
  list.forEach((d, i) => {
    body.innerHTML += `
      <tr>
        <td class="rank-pos">#${i + 1}</td>
        <td><a href="driver.html?id=${d.id}" class="driver-link">${d.callsign}</a></td>
        <td>${d.country || '—'}</td>
        <td class="rank-num">${String(d.driver_number).padStart(3,'0')}</td>
        <td><span class="rank-tier">${d.tier}</span></td>
        <td class="rank-points">${d.power_points}</td>
      </tr>`;
  });
}

// ---------- Awards ----------
const AWARD_CATEGORIES = [
  'Driver of the Month','Rookie of the Month','Most Improved Driver','Most Consistent Driver',
  'Fastest of the Month','Map of the Month','Overtake of the Month','Comeback of the Month',
  'League of the Month','Race of the Month','Lap of the Month'
];

// Populate the admin "Set award winner" category dropdown, if this page has one
const awardCategorySelect = document.getElementById('awardCategory');
if(awardCategorySelect){
  awardCategorySelect.innerHTML = AWARD_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
}

function awardDocId(category, month){
  return `${category}__${month}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

async function loadAwards(){
  if(!$('awardsGrid')) return;

  const currentMonth = new Date().toISOString().slice(0,7);
  const snap = await db.collection('awards').where('month', '==', currentMonth).get();
  const awards = snap.docs.map(d => d.data());
  const grid = document.getElementById('awardsGrid');
  grid.innerHTML = AWARD_CATEGORIES.map(cat => {
    const match = awards.find(a => a.category === cat);
    return `
      <div class="award-card">
        <div class="cat">${cat}</div>
        <div class="winner ${match && match.winner_callsign ? '' : 'empty'}">${match && match.winner_callsign ? match.winner_callsign : 'TBD'}</div>
      </div>`;
  }).join('');
}

// ---------- League / track directories ----------
async function loadDirectories(){
  if(!$('leaguesGrid') && !$('tracksGrid')) return;

  const leagueSnap = await db.collection('leagues').where('active', '==', true).orderBy('name').get();
  document.getElementById('leaguesGrid').innerHTML = leagueSnap.docs.map(d =>
    `<a href="league.html?id=${d.id}" class="chip">${d.data().name}</a>`).join('');

  const trackSnap = await db.collection('tracks').where('active', '==', true).orderBy('name').get();
  document.getElementById('tracksGrid').innerHTML = trackSnap.docs.map(d => `<div class="chip track">${d.data().name}</div>`).join('');
}

// ---------- Track makers ----------
async function loadTrackMakers(){
  if(!$('makersGrid')) return;

  const snap = await db.collection('track_makers').where('active', '==', true).orderBy('name').get();
  document.getElementById('makersGrid').innerHTML = snap.docs.map(d => {
    const m = d.data();
    return `
    <div class="maker-card">
      <h4>${m.name}</h4>
      <div class="epic">${m.epic_username ? 'Epic: ' + m.epic_username : ''}</div>
      ${m.map_code
        ? `<div class="maker-code-row"><span class="maker-code">${m.map_code}</span><button class="maker-copy" onclick="navigator.clipboard.writeText('${m.map_code}')">COPY</button></div>`
        : `<div class="maker-no-code">No map code listed</div>`}
    </div>`;
  }).join('');
}

// ---------- Admin ----------
function renderPromoTable(rows, tbody){
  tbody.innerHTML = '';
  rows.forEach(p => {
    tbody.innerHTML += `
      <tr>
        <td>${p.title}</td>
        <td>${p.description || ''}</td>
        <td class="${p.active ? 'tag-active' : 'tag-inactive'}">${p.active ? 'Active' : 'Off'}</td>
        <td><button class="row-btn" onclick="togglePromotion('${p.id}', ${p.active})">${p.active ? 'Deactivate' : 'Activate'}</button></td>
      </tr>`;
  });
}

async function loadAdminData(){
  if(!$('adminStatsTable')) return;

  const pendingSnap = await db.collection('driver_stats').where('status', '==', 'pending').orderBy('submitted_at', 'asc').get();
  const pendingStats = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const statsBody = document.querySelector('#adminStatsTable tbody');
  const statsEmpty = document.getElementById('adminStatsEmpty');
  statsBody.innerHTML = '';
  if(pendingStats.length){
    statsEmpty.classList.add('hidden');
    pendingStats.forEach(s => {
      statsBody.innerHTML += `
        <tr>
          <td>${s.callsign || '—'}</td>
          <td>${s.races}</td>
          <td>${s.wins}</td>
          <td>${s.podiums}</td>
          <td>${s.poles}</td>
          <td>${s.wcc}</td>
          <td>${s.wdc}</td>
          <td>
            <button class="approve-btn" onclick="reviewStat('${s.id}','approved')">Approve</button>
            <button class="reject-btn" onclick="reviewStat('${s.id}','rejected')">Reject</button>
          </td>
        </tr>`;
    });
  } else {
    statsEmpty.classList.remove('hidden');
  }

  const promoSnap = await db.collection('promotions').orderBy('created_at', 'desc').get();
  const promos = promoSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const league = promos.filter(p => p.type === 'league');
  const server = promos.filter(p => p.type === 'server');

  renderPromoTable(league, document.querySelector('#adminLeagueTable tbody'));
  renderPromoTable(server, document.querySelector('#adminServerTable tbody'));

  const driverSnap = await db.collection('profiles').orderBy('driver_number', 'asc').get();
  const drivers = driverSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const drvBody = document.querySelector('#adminDriversTable tbody');
  drvBody.innerHTML = '';
  drivers.forEach(d => {
    drvBody.innerHTML += `
      <tr>
        <td>${d.callsign}</td>
        <td>${d.epic_username}</td>
        <td class="mono">#${String(d.driver_number).padStart(3,'0')}</td>
        <td>
          <select onchange="setTier('${d.id}', this.value)" style="background:var(--asphalt); color:var(--white); border:1px solid var(--line); border-radius:4px; padding:4px 6px;">
            ${['rookie','racer','pro','elite'].map(t => `<option value="${t}" ${d.tier===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </td>
        <td>
          <input type="number" value="${d.power_points}" style="width:70px; background:var(--asphalt); color:var(--white); border:1px solid var(--line); border-radius:4px; padding:4px 6px;"
            onchange="setPoints('${d.id}', this.value)">
        </td>
        <td>
          <input type="text" placeholder="Discord ID" value="${d.discord_id || ''}" style="width:120px; background:var(--asphalt); color:var(--white); border:1px solid var(--line); border-radius:4px; padding:4px 6px;"
            onchange="setDiscordId('${d.id}', this.value)">
        </td>
        <td>
          <button class="row-btn" onclick="syncDiscordAdmin('${d.id}', '${d.discord_id || ''}')">${d.is_admin ? 'Admin ✓' : 'Sync admin'}</button>
        </td>
        <td>
          <button class="row-btn danger" onclick="deleteDriverAccount('${d.id}', '${(d.callsign || '').replace(/'/g, "\\'")}')">Delete</button>
        </td>
      </tr>`;
  });

  const leagueSnap = await db.collection('leagues').orderBy('name').get();
  const leagueBody = document.querySelector('#adminLeaguesTable tbody');
  leagueBody.innerHTML = '';
  leagueSnap.docs.forEach(doc => {
    const l = doc.data();
    leagueBody.innerHTML += `
      <tr>
        <td>${l.name}</td>
        <td>
          <input type="text" value="${l.description || ''}" placeholder="Description" style="width:150px; background:var(--asphalt); color:var(--white); border:1px solid var(--line); border-radius:4px; padding:4px 6px;"
            onchange="setLeagueField('${doc.id}', 'description', this.value)">
        </td>
        <td>
          <input type="text" value="${l.link || ''}" placeholder="https://..." style="width:150px; background:var(--asphalt); color:var(--white); border:1px solid var(--line); border-radius:4px; padding:4px 6px;"
            onchange="setLeagueField('${doc.id}', 'link', this.value)">
        </td>
        <td class="${l.active ? 'tag-active' : 'tag-inactive'}">${l.active ? 'Active' : 'Off'}</td>
        <td><button class="row-btn" onclick="toggleDirectoryItem('leagues','${doc.id}', ${l.active})">${l.active ? 'Deactivate' : 'Activate'}</button></td>
      </tr>`;
  });

  const trackSnap = await db.collection('tracks').orderBy('name').get();
  const trackBody = document.querySelector('#adminTracksTable tbody');
  trackBody.innerHTML = '';
  trackSnap.docs.forEach(doc => {
    const t = doc.data();
    trackBody.innerHTML += `
      <tr>
        <td>${t.name}</td>
        <td class="${t.active ? 'tag-active' : 'tag-inactive'}">${t.active ? 'Active' : 'Off'}</td>
        <td><button class="row-btn" onclick="toggleDirectoryItem('tracks','${doc.id}', ${t.active})">${t.active ? 'Deactivate' : 'Activate'}</button></td>
      </tr>`;
  });

  const makerSnap = await db.collection('track_makers').orderBy('name').get();
  const makerBody = document.querySelector('#adminMakersTable tbody');
  makerBody.innerHTML = '';
  makerSnap.docs.forEach(doc => {
    const m = doc.data();
    makerBody.innerHTML += `
      <tr>
        <td>${m.name}</td>
        <td>${m.epic_username || '—'}</td>
        <td class="mono">${m.map_code || '—'}</td>
        <td class="${m.active ? 'tag-active' : 'tag-inactive'}">${m.active ? 'Active' : 'Off'}</td>
        <td><button class="row-btn" onclick="toggleTrackMaker('${doc.id}', ${m.active})">${m.active ? 'Deactivate' : 'Activate'}</button></td>
      </tr>`;
  });
}

async function addPromotion(type){
  const titleEl = document.getElementById(type + 'Title');
  const descEl = document.getElementById(type + 'Desc');
  const title = titleEl.value.trim();
  const description = descEl.value.trim();
  if(!title) return;
  await db.collection('promotions').add({ type, title, description, active: true, created_at: new Date().toISOString() });
  titleEl.value = '';
  descEl.value = '';
  loadAdminData(); loadPromotions();
}

async function togglePromotion(id, active){
  await db.collection('promotions').doc(id).update({ active: !active });
  loadAdminData(); loadPromotions();
}

async function setTier(id, tier){
  await db.collection('profiles').doc(id).update({ tier });
  loadAdminData(); loadCatalogue(); loadRankings();
}

async function setPoints(id, power_points){
  await db.collection('profiles').doc(id).update({ power_points: parseInt(power_points) || 0 });
  loadAdminData(); loadCatalogue(); loadRankings();
}

async function setDiscordId(id, discordId){
  await db.collection('profiles').doc(id).update({ discord_id: discordId.trim() });
}

// Manual, admin-triggered Discord role check + admin flag sync (replaces automatic OAuth login sync)
async function syncDiscordAdmin(profileId, discordId){
  if(!discordId){ alert("Enter that driver's Discord ID first, then click Sync admin."); return; }
  try{
    const res = await fetch(DISCORD_ROLE_CHECK_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discord_id: discordId })
    });
    if(!res.ok){ alert('Discord role check failed — is the Worker deployed?'); return; }
    const { isAdmin } = await res.json();
    await db.collection('profiles').doc(profileId).update({ is_admin: isAdmin });
    loadAdminData();
  } catch(e){
    alert('Could not reach the Discord sync Worker: ' + e.message);
  }
}

function downloadCsvTemplate(){
  const csv = 'callsign,races,wins,podiums,poles,wcc,wdc,power_points\nNightApex,5,2,4,1,0,0,1250\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.download = 'fdh-stats-template.csv';
  link.href = URL.createObjectURL(blob);
  link.click();
}

function parseCsv(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if(!lines.length) return { header: [], rows: [] };
  const splitLine = (line) => line.split(',').map(cell => cell.trim().replace(/^"(.*)"$/, '$1'));
  const header = splitLine(lines[0]).map(h => h.toLowerCase());
  const rows = lines.slice(1).map(splitLine);
  return { header, rows };
}

async function handleBulkStatsUpload(){
  const fileInput = document.getElementById('bulkStatsFile');
  const resultEl = document.getElementById('bulkUploadResult');
  resultEl.className = 'form-msg'; resultEl.textContent = '';

  const file = fileInput.files[0];
  if(!file){ resultEl.textContent = 'Choose a CSV file first.'; resultEl.className = 'form-msg error'; return; }

  const text = await file.text();
  const { header, rows } = parseCsv(text);

  const required = ['callsign','races','wins','podiums','poles','wcc','wdc'];
  const missing = required.filter(col => !header.includes(col));
  if(missing.length){
    resultEl.textContent = `CSV is missing required column(s): ${missing.join(', ')}`;
    resultEl.className = 'form-msg error';
    return;
  }

  const idx = {};
  header.forEach((h, i) => idx[h] = i);

  // Build a callsign -> profile id lookup
  const profileSnap = await db.collection('profiles').get();
  const callsignToId = {};
  profileSnap.docs.forEach(d => { callsignToId[(d.data().callsign || '').toLowerCase()] = d.id; });

  let updated = 0;
  const notFound = [];

  for(const row of rows){
    const callsign = row[idx['callsign']];
    if(!callsign) continue;
    const id = callsignToId[callsign.toLowerCase()];
    if(!id){ notFound.push(callsign); continue; }

    const statsPayload = {
      callsign,
      races: parseInt(row[idx['races']]) || 0,
      wins: parseInt(row[idx['wins']]) || 0,
      podiums: parseInt(row[idx['podiums']]) || 0,
      poles: parseInt(row[idx['poles']]) || 0,
      wcc: parseInt(row[idx['wcc']]) || 0,
      wdc: parseInt(row[idx['wdc']]) || 0,
      status: 'approved',
      submitted_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString()
    };

    await db.collection('driver_stats').doc(id).set(statsPayload, { merge: true });

    if(idx['power_points'] !== undefined && row[idx['power_points']] !== '' && row[idx['power_points']] !== undefined){
      await db.collection('profiles').doc(id).update({ power_points: parseInt(row[idx['power_points']]) || 0 });
    }

    updated++;
  }

  resultEl.className = notFound.length ? 'form-msg error' : 'form-msg ok';
  resultEl.textContent = `Updated ${updated} driver${updated === 1 ? '' : 's'}.` +
    (notFound.length ? ` Not found (check spelling): ${notFound.join(', ')}` : '');

  fileInput.value = '';
  loadAdminData(); loadPublicStats(); loadCatalogue(); loadRankings();
}

async function deleteDriverAccount(profileId, callsign){
  const confirmed = confirm(
    `Delete ${callsign}'s account?\n\n` +
    `This removes them from the catalogue, rankings, and stats permanently. ` +
    `Their login itself isn't deleted (Firebase doesn't allow that from the browser) — ` +
    `they just won't have a driver profile anymore if they log back in.\n\n` +
    `This can't be undone. Continue?`
  );
  if(!confirmed) return;

  try{
    await db.collection('profiles').doc(profileId).delete();
    await db.collection('driver_stats').doc(profileId).delete().catch(() => {}); // ok if they had no stats doc
  } catch(e){
    alert('Delete failed: ' + e.message);
    return;
  }

  loadAdminData(); loadCatalogue(); loadRankings(); loadPublicStats(); loadCompareSelects();
}

async function setAward(){
  const category = document.getElementById('awardCategory').value.trim();
  const month = document.getElementById('awardMonth').value.trim();
  const winner_callsign = document.getElementById('awardWinner').value.trim();
  if(!category || !month) return;
  await db.collection('awards').doc(awardDocId(category, month)).set({ category, month, winner_callsign }, { merge: true });
  document.getElementById('awardMonth').value = '';
  document.getElementById('awardWinner').value = '';
  loadAwards();
}

async function addDirectoryItem(table){
  const inputId = table === 'leagues' ? 'newLeagueName' : 'newTrackName';
  const input = document.getElementById(inputId);
  const name = input.value.trim();
  if(!name) return;
  await db.collection(table).add({ name, active: true });
  input.value = '';
  loadAdminData(); loadDirectories();
}

async function addLeague(){
  const nameEl = document.getElementById('newLeagueName');
  const descEl = document.getElementById('newLeagueDesc');
  const linkEl = document.getElementById('newLeagueLink');
  const name = nameEl.value.trim();
  if(!name) return;
  await db.collection('leagues').add({
    name,
    description: descEl.value.trim(),
    link: linkEl.value.trim(),
    active: true
  });
  nameEl.value = ''; descEl.value = ''; linkEl.value = '';
  loadAdminData(); loadDirectories();
}

async function setLeagueField(id, field, value){
  await db.collection('leagues').doc(id).update({ [field]: value.trim() });
}

async function toggleDirectoryItem(table, id, active){
  await db.collection(table).doc(id).update({ active: !active });
  loadAdminData(); loadDirectories();
}

async function addTrackMaker(){
  const name = document.getElementById('newMakerName').value.trim();
  const epic_username = document.getElementById('newMakerEpic').value.trim();
  const map_code = document.getElementById('newMakerCode').value.trim();
  if(!name) return;
  await db.collection('track_makers').add({ name, epic_username, map_code, active: true });
  document.getElementById('newMakerName').value = '';
  document.getElementById('newMakerEpic').value = '';
  document.getElementById('newMakerCode').value = '';
  loadAdminData(); loadTrackMakers();
}

async function reviewStat(id, status){
  await db.collection('driver_stats').doc(id).update({ status, reviewed_at: new Date().toISOString() });
  loadAdminData(); loadPublicStats();
}

async function toggleTrackMaker(id, active){
  await db.collection('track_makers').doc(id).update({ active: !active });
  loadAdminData(); loadTrackMakers();
}

// ---------- Driver profile page (driver.html) ----------
const BADGE_DEFS = [
  { id: 'first-win',    name: 'First Win',      icon: '🏆', check: s => s && s.wins >= 1 },
  { id: 'race-starter', name: 'Race Starter',   icon: '🏁', check: s => s && s.races >= 1 },
  { id: 'ten-races',    name: '10 Races',       icon: '🔟', check: s => s && s.races >= 10 },
  { id: 'fifty-races',  name: '50 Races',       icon: '⚡', check: s => s && s.races >= 50 },
  { id: 'century',      name: 'Century Club',   icon: '💯', check: s => s && s.races >= 100 },
  { id: 'podium-regular', name: 'Podium Regular', icon: '🥇', check: s => s && s.podiums >= 5 },
  { id: 'pole-sitter',  name: 'Pole Sitter',    icon: '🎯', check: s => s && s.poles >= 1 },
  { id: 'wdc-champion', name: 'WDC Champion',   icon: '🏅', check: s => s && s.wdc >= 1 },
  { id: 'wcc-champion', name: 'WCC Champion',   icon: '🛠️', check: s => s && s.wcc >= 1 },
  { id: 'elite-tier',   name: 'Elite Licence',  icon: '👑', check: (s, p) => p && p.tier === 'elite' },
];

async function loadDriverProfile(){
  const grid = $('driverProfileGrid');
  if(!grid) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const notFound = $('driverNotFound');

  if(!id){ if(notFound) notFound.classList.remove('hidden'); return; }

  const profileDoc = await db.collection('profiles').doc(id).get();
  if(!profileDoc.exists){ if(notFound) notFound.classList.remove('hidden'); return; }
  const p = { id: profileDoc.id, ...profileDoc.data() };

  const statsDoc = await db.collection('driver_stats').doc(id).get();
  const s = (statsDoc.exists && statsDoc.data().status === 'approved') ? statsDoc.data() : null;

  // License card
  if($('dpCallsign')) $('dpCallsign').textContent = p.callsign;
  if($('dpEpic')) $('dpEpic').textContent = p.epic_username;
  if($('dpTier')) $('dpTier').textContent = p.tier;
  if($('dpSignature')) $('dpSignature').textContent = p.callsign;
  if($('dpAvatar')){
    const img = $('dpAvatar');
    const fallback = $('dpPhotoFallback');
    if(p.avatar_url){
      img.src = p.avatar_url; img.style.display = 'block';
      if(fallback) fallback.style.display = 'none';
    } else {
      img.style.display = 'none';
      if(fallback){ fallback.style.display = 'flex'; fallback.textContent = (p.callsign || '?').charAt(0).toUpperCase(); }
    }
  }
  if($('dpNumber')) $('dpNumber').textContent = '#' + String(p.driver_number).padStart(3,'0');
  if($('dpCountry')) $('dpCountry').textContent = p.country || '—';
  if($('dpPoints')) $('dpPoints').textContent = p.power_points;

  // Stats
  const statsBlock = $('dpStatsBlock');
  const noStatsMsg = $('dpNoStats');
  if(s && statsBlock){
    statsBlock.classList.remove('hidden');
    if(noStatsMsg) noStatsMsg.classList.add('hidden');
    const winPct = s.races > 0 ? Math.round((s.wins / s.races) * 100) : 0;
    if($('dpRaces')) $('dpRaces').textContent = s.races;
    if($('dpWins')) $('dpWins').textContent = s.wins;
    if($('dpPodiums')) $('dpPodiums').textContent = s.podiums;
    if($('dpPoles')) $('dpPoles').textContent = s.poles;
    if($('dpWcc')) $('dpWcc').textContent = s.wcc;
    if($('dpWdc')) $('dpWdc').textContent = s.wdc;
    if($('dpWinPct')) $('dpWinPct').textContent = winPct + '%';
  } else {
    if(statsBlock) statsBlock.classList.add('hidden');
    if(noStatsMsg) noStatsMsg.classList.remove('hidden');
  }

  // Badges
  const badgesGrid = $('dpBadges');
  if(badgesGrid){
    const earned = BADGE_DEFS.filter(b => b.check(s, p));
    badgesGrid.innerHTML = earned.length
      ? earned.map(b => `
          <div class="badge-card">
            <div class="badge-icon">${b.icon}</div>
            <div class="badge-name">${b.name}</div>
          </div>`).join('')
      : `<div class="promo-empty">No badges earned yet — get some approved race results on the board!</div>`;
  }

  grid.classList.remove('hidden');
}

// ---------- League profile page (league.html) ----------
async function loadLeagueProfile(){
  const wrap = $('leagueProfileGrid');
  if(!wrap) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const notFound = $('leagueNotFound');

  if(!id){ if(notFound) notFound.classList.remove('hidden'); return; }

  const doc = await db.collection('leagues').doc(id).get();
  if(!doc.exists){ if(notFound) notFound.classList.remove('hidden'); return; }
  const l = doc.data();

  if($('lpName')) $('lpName').textContent = l.name;
  if($('lpDesc')) $('lpDesc').textContent = l.description || 'No description added yet.';

  const linkBtn = $('lpLinkBtn');
  if(linkBtn){
    if(l.link){
      linkBtn.href = l.link;
      linkBtn.classList.remove('hidden');
    } else {
      linkBtn.classList.add('hidden');
    }
  }

  wrap.classList.remove('hidden');
}

// ---------- Scroll reveal ----------
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('in'); });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ---------- Count-up animation ----------
function countUp(el, target, duration = 900){
  const start = performance.now();
  function tick(now){
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target);
    if(progress < 1) requestAnimationFrame(tick);
    else el.textContent = target;
  }
  requestAnimationFrame(tick);
}

// ---------- Driver spotlight (homepage) ----------
async function loadSpotlight(){
  const card = $('spotlightCard');
  if(!card) return;

  const snap = await db.collection('profiles').get();
  const drivers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if(!drivers.length) return;

  const pick = drivers[Math.floor(Math.random() * drivers.length)];

  if($('spotlightCallsign')) $('spotlightCallsign').textContent = pick.callsign;
  if($('spotlightTier')) $('spotlightTier').textContent = pick.tier;
  if($('spotlightNumber')) $('spotlightNumber').textContent = '#' + String(pick.driver_number).padStart(3,'0');
  if($('spotlightCountry')) $('spotlightCountry').textContent = pick.country || '—';
  if($('spotlightLink')) $('spotlightLink').href = 'driver.html?id=' + pick.id;

  const img = $('spotlightAvatar');
  const fallback = $('spotlightPhotoFallback');
  if(img){
    if(pick.avatar_url){
      img.src = pick.avatar_url; img.style.display = 'block';
      if(fallback) fallback.style.display = 'none';
    } else {
      img.style.display = 'none';
      if(fallback){ fallback.style.display = 'flex'; fallback.textContent = (pick.callsign || '?').charAt(0).toUpperCase(); }
    }
  }

  card.classList.remove('hidden');
}

// ---------- Driver comparison ----------
async function loadCompareSelects(){
  const selA = $('compareA');
  const selB = $('compareB');
  if(!selA || !selB) return;

  const snap = await db.collection('profiles').orderBy('callsign').get();
  const options = snap.docs.map(d => `<option value="${d.id}">${d.data().callsign}</option>`).join('');
  selA.innerHTML = '<option value="">Select driver A…</option>' + options;
  selB.innerHTML = '<option value="">Select driver B…</option>' + options;
}

async function renderComparison(){
  const idA = $('compareA').value;
  const idB = $('compareB').value;
  const empty = $('compareEmpty');
  const result = $('compareResult');

  if(!idA || !idB || idA === idB){
    result.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = (!idA || !idB)
      ? 'Pick two drivers above to see them side by side.'
      : "Pick two different drivers — can't compare a driver to themselves.";
    return;
  }

  const [profADoc, profBDoc, statsADoc, statsBDoc] = await Promise.all([
    db.collection('profiles').doc(idA).get(),
    db.collection('profiles').doc(idB).get(),
    db.collection('driver_stats').doc(idA).get(),
    db.collection('driver_stats').doc(idB).get()
  ]);

  const pA = profADoc.data();
  const pB = profBDoc.data();
  const sA = (statsADoc.exists && statsADoc.data().status === 'approved') ? statsADoc.data() : null;
  const sB = (statsBDoc.exists && statsBDoc.data().status === 'approved') ? statsBDoc.data() : null;

  empty.classList.add('hidden');
  result.classList.remove('hidden');

  $('compareNameA').textContent = pA.callsign;
  $('compareNameB').textContent = pB.callsign;

  function row(label, valA, valB, higherWins){
    let cellA = `<td>${valA}</td>`;
    let cellB = `<td>${valB}</td>`;
    if(higherWins && typeof valA === 'number' && typeof valB === 'number' && valA !== valB){
      if(valA > valB) cellA = `<td class="winner">${valA}</td>`;
      else cellB = `<td class="winner">${valB}</td>`;
    }
    return `<tr><td>${label}</td>${cellA}${cellB}</tr>`;
  }

  const winPctA = sA && sA.races > 0 ? Math.round((sA.wins / sA.races) * 100) : 0;
  const winPctB = sB && sB.races > 0 ? Math.round((sB.wins / sB.races) * 100) : 0;

  let html = '';
  html += row('Licence', pA.tier, pB.tier, false);
  html += row('Driver No.', '#' + String(pA.driver_number).padStart(3,'0'), '#' + String(pB.driver_number).padStart(3,'0'), false);
  html += row('Country', pA.country || '—', pB.country || '—', false);
  html += row('Power Points', pA.power_points, pB.power_points, true);

  if(!sA && !sB){
    html += `<tr><td colspan="3" style="text-align:center; color:var(--dim); padding:16px;">Neither driver has approved stats yet.</td></tr>`;
  } else {
    html += row('Races', sA ? sA.races : 0, sB ? sB.races : 0, true);
    html += row('Wins', sA ? sA.wins : 0, sB ? sB.wins : 0, true);
    html += row('Podiums', sA ? sA.podiums : 0, sB ? sB.podiums : 0, true);
    html += row('Poles', sA ? sA.poles : 0, sB ? sB.poles : 0, true);
    html += row('WCC', sA ? sA.wcc : 0, sB ? sB.wcc : 0, true);
    html += row('WDC', sA ? sA.wdc : 0, sB ? sB.wdc : 0, true);
    html += row('Win %', winPctA + '%', winPctB + '%', false);
  }

  $('compareBody').innerHTML = html;
}

// ---------- Download license card as image ----------
async function downloadLicenseCard(elementId, filename){
  const el = document.getElementById(elementId);
  if(!el || typeof html2canvas === 'undefined'){
    alert('Could not generate the image — try refreshing the page.');
    return;
  }
  try{
    const canvas = await html2canvas(el, { backgroundColor: null, scale: 3, useCORS: true });
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch(e){
    alert('Download failed: ' + e.message + ' (this can happen if the avatar image is hosted somewhere that blocks downloads — try a different image host.)');
  }
}

// ---------- Intro lights-out animation (homepage only, once per browser session) ----------
function runIntro(){
  const overlay = document.getElementById('introOverlay');
  if(!overlay) return;

  if(sessionStorage.getItem('fdh_intro_seen')){
    overlay.remove();
    return;
  }
  sessionStorage.setItem('fdh_intro_seen', '1');
  document.body.style.overflow = 'hidden';

  const lights = overlay.querySelectorAll('.intro-light');
  const stepDelay = 380;
  lights.forEach((light, i) => {
    setTimeout(() => light.classList.add('lit'), 400 + i * stepDelay);
  });

  const allLitTime = 400 + lights.length * stepDelay;
  setTimeout(() => {
    lights.forEach(l => l.classList.remove('lit')); // lights out — and away we go
    setTimeout(hideIntro, 350);
  }, allLitTime + 550);
}

function hideIntro(){
  const overlay = document.getElementById('introOverlay');
  if(!overlay) return;
  overlay.classList.add('intro-hide');
  document.body.style.overflow = '';
  setTimeout(() => overlay.remove(), 700);
}

function skipIntro(){
  hideIntro();
}

// ---------- Init ----------
auth.onAuthStateChanged((user) => { refreshSession(user); loadDriverProfile(); loadLeagueProfile(); });
runIntro();

// ---------- PWA service worker registration ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker registration failed:', e));
  });
}
