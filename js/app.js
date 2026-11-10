/* Aivoharjoitus – ohjauspaneeli (ylläpitäjä, ohjaaja) ja pelaajan näkymä. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendPasswordResetEmail, signInAnonymously, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where,
  onSnapshot, getDocs, serverTimestamp, increment, writeBatch, Timestamp, connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig, REPO_URL } from './firebase-config.js';
import { createExercise, esc } from './exercise.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const EMU = params.has('emu') && ['localhost', '127.0.0.1'].includes(location.hostname);
const configured = !Object.values(firebaseConfig).some(v => String(v).includes('PEGA_AQUI'));

function makeApp(name) {
  const a = initializeApp(EMU ? { ...firebaseConfig, apiKey: 'demo', projectId: 'demo-aivoharjoitus' } : firebaseConfig, name);
  const auth = getAuth(a); auth.languageCode = 'fi';
  const db = getFirestore(a);
  if (EMU) { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8080); }
  return { auth, db };
}

const cleanName = (n, max = 24) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, max);
const fmt = ms => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/* Ryhmän värivaihtoehdot (10). ink = tekstin väri värin päällä. */
const TEAM_COLORS = {
  punainen: { name: 'punainen', hex: '#e53935', ink: '#fff' }, oranssi: { name: 'oranssi', hex: '#fb8c00', ink: '#1a1a1a' },
  keltainen: { name: 'keltainen', hex: '#fdd835', ink: '#1a1a1a' }, vihrea: { name: 'vihreä', hex: '#43a047', ink: '#fff' },
  turkoosi: { name: 'turkoosi', hex: '#00acc1', ink: '#fff' }, sininen: { name: 'sininen', hex: '#1e5fd6', ink: '#fff' },
  violetti: { name: 'violetti', hex: '#8e24aa', ink: '#fff' }, pinkki: { name: 'pinkki', hex: '#ec407a', ink: '#fff' },
  ruskea: { name: 'ruskea', hex: '#795548', ink: '#fff' }, musta: { name: 'musta', hex: '#263238', ink: '#fff' },
};
const BOT_NAMES = ['Kettu', 'Jänis', 'Orava', 'Siili'];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const ERR = {
  'auth/invalid-credential': 'Sähköposti tai salasana on väärin.',
  'auth/wrong-password': 'Salasana on väärin.',
  'auth/user-not-found': 'Käyttäjää ei löytynyt.',
  'auth/email-already-in-use': 'Tällä sähköpostilla on jo tunnus.',
  'auth/weak-password': 'Salasanan pitää olla vähintään 6 merkkiä.',
  'auth/invalid-email': 'Sähköpostiosoite ei kelpaa.',
  'auth/too-many-requests': 'Liian monta yritystä. Odota hetki ja yritä uudelleen.',
  'auth/requires-recent-login': 'Kirjaudu uudelleen ja yritä sitten uudestaan.',
  'auth/network-request-failed': 'Ei verkkoyhteyttä.',
  'permission-denied': 'Sinulla ei ole oikeutta tähän.',
};
const errText = e => ERR[e?.code] || 'Jokin meni vikaan. Yritä uudelleen.';

let toastQ = [], toastOn = false;
function toast(name, pts) { toastQ.push([name, pts]); if (!toastOn) nextToast(); }
function nextToast() {
  // En la pantalla de carrera el aviso sale en su propio espacio, debajo de la pista; si no, como aviso flotante.
  const feed = document.getElementById('feed'), el = document.getElementById('toast'), t = toastQ.shift();
  if (!t) { el.hidden = true; if (feed) feed.innerHTML = ''; toastOn = false; return; }
  toastOn = true;
  const txt = `+${t[1]} ${t[1] === 1 ? 'piste' : 'pistettä'}`;
  if (feed) {
    el.hidden = true;
    feed.innerHTML = '<div class="feedtoast"><span class="tn"></span><span class="tp"></span></div>';
    feed.querySelector('.tn').textContent = t[0]; feed.querySelector('.tp').textContent = txt;
  } else {
    document.getElementById('tn').textContent = t[0]; document.getElementById('tp').textContent = txt;
    el.hidden = true; void el.offsetWidth; el.hidden = false;
  }
  setTimeout(nextToast, toastQ.length > 3 ? 1400 : 3000);
}

if (!configured && !EMU) {
  app.innerHTML = `<div class="card"><h1>Asennus kesken</h1><p>Tiedostoon <code>js/firebase-config.js</code> pitää vielä liittää Firebase-projektin asetukset.</p></div>`;
} else if (params.get('peli')) {
  playerMain(params.get('peli'));
} else {
  staffMain();
}

/* ===================================================================== */
/* PERSONAL: ylläpitäjä ja ohjaaja                                        */
/* ===================================================================== */
function staffMain() {
  document.body.classList.add('wide');
  const { auth, db } = makeApp(undefined);
  let me = null, bootstrapping = false, cleanup = [];
  const clearViews = () => { cleanup.forEach(f => { try { f(); } catch (e) { } }); cleanup = []; };

  onAuthStateChanged(auth, u => { if (!bootstrapping) handleUser(u); });

  async function handleUser(u) {
    clearViews(); me = null;
    if (!u) return loginView();
    if (u.isAnonymous) { await signOut(auth); return; }
    let snap;
    try { snap = await getDoc(doc(db, 'users', u.uid)); } catch (e) { snap = null; }
    const p = snap?.exists() ? snap.data() : null;
    if (!p || !['admin', 'user'].includes(p.role)) {
      app.innerHTML = `<div class="card"><h1>Ei käyttöoikeutta</h1><p>Tunnuksella ${esc(u.email || '')} ei ole oikeutta ohjauspaneeliin. Pyydä ylläpitäjää tarkistamaan tunnuksesi.</p><button class="btn" id="out">Kirjaudu ulos</button></div>`;
      document.getElementById('out').onclick = () => signOut(auth);
      return;
    }
    me = { uid: u.uid, email: u.email, name: p.name, role: p.role };
    route();
  }

  window.addEventListener('hashchange', () => { if (me) route(); });

  function route() {
    clearViews();
    const h = location.hash.slice(1);
    if (h.startsWith('peli-')) return gameView(h.slice(5));
    if (h === 'kayttajat' && me.role === 'admin') return usersView();
    if (h === 'harjoittele') return practiceView();
    if (h === 'tili') return accountView();
    return gamesView();
  }

  function frame(active, inner) {
    const nav = [['pelit', 'Pelit'], ...(me.role === 'admin' ? [['kayttajat', 'Käyttäjät']] : []), ['harjoittele', 'Kokeile harjoituksia'], ['tili', 'Oma tili']];
    app.innerHTML = `
      <header class="bar">
        <span class="brand">Aivoharjoitus</span>
        <nav class="nav">${nav.map(([k, t]) => `<button class="navbtn" data-go="${k}" ${k === active ? 'aria-current="page"' : ''}>${t}</button>`).join('')}</nav>
        <span class="who">${esc(me.name)} <span class="role ${me.role}">${me.role === 'admin' ? 'ylläpitäjä' : 'ohjaaja'}</span> <button class="linkbtn" id="logout">Kirjaudu ulos</button></span>
      </header>${inner}`;
    app.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; });
    document.getElementById('logout').onclick = () => { location.hash = ''; signOut(auth); };
  }

  /* ---------- Kirjautuminen ja ensimmäinen ylläpitäjä ---------- */
  async function loginView() {
    let setupDone = true;
    try { setupDone = (await getDoc(doc(db, 'config', 'setup'))).exists(); } catch (e) { }
    if (!setupDone) return bootstrapView();
    app.innerHTML = `
      <div><h1>Aivoharjoitus</h1><p class="muted">Ohjaajien ja ylläpitäjien kirjautuminen. Pelaajat tulevat peliin ohjaajan antamalla linkillä tai QR-koodilla.</p></div>
      <form class="card form" id="f" novalidate>
        <label for="em">Sähköposti</label><input id="em" type="email" autocomplete="username" required>
        <label for="pw">Salasana</label><input id="pw" type="password" autocomplete="current-password" required>
        <p class="err" id="msg" hidden></p>
        <button class="btn" type="submit">Kirjaudu</button>
        <button class="linkbtn" type="button" id="forgot">Unohditko salasanan?</button>
      </form>`;
    const msg = document.getElementById('msg'), show = (t, ok) => { msg.hidden = false; msg.className = ok ? 'okmsg' : 'err'; msg.textContent = t; };
    document.getElementById('f').onsubmit = async e => {
      e.preventDefault();
      try { await signInWithEmailAndPassword(auth, document.getElementById('em').value.trim(), document.getElementById('pw').value); }
      catch (err) { show(errText(err)); }
    };
    document.getElementById('forgot').onclick = async () => {
      const em = document.getElementById('em').value.trim();
      if (!em) return show('Kirjoita ensin sähköpostiosoitteesi.');
      try { await sendPasswordResetEmail(auth, em); show('Jos osoitteella on tunnus, sinne lähetettiin linkki salasanan vaihtamiseen.', true); }
      catch (err) { show(errText(err)); }
    };
  }

  function bootstrapView() {
    app.innerHTML = `
      <div><h1>Käyttöönotto</h1><p class="muted">Ohjelmassa ei ole vielä yhtään ylläpitäjää. Luo ensimmäinen ylläpitäjän tunnus. Tämä näkymä on käytössä vain kerran.</p></div>
      <form class="card form" id="f" novalidate>
        <label for="nm">Nimi</label><input id="nm" autocomplete="name" required>
        <label for="em">Sähköposti</label><input id="em" type="email" autocomplete="username" required>
        <label for="pw">Salasana (vähintään 6 merkkiä)</label><input id="pw" type="password" autocomplete="new-password" required>
        <p class="err" id="msg" hidden></p>
        <button class="btn" type="submit">Luo ylläpitäjä</button>
      </form>`;
    document.getElementById('f').onsubmit = async e => {
      e.preventDefault();
      const msg = document.getElementById('msg'), name = cleanName(document.getElementById('nm').value, 40), email = document.getElementById('em').value.trim();
      if (!name) { msg.hidden = false; msg.textContent = 'Kirjoita nimi.'; return; }
      bootstrapping = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, document.getElementById('pw').value);
        const b = writeBatch(db);
        b.set(doc(db, 'users', cred.user.uid), { name, email, role: 'admin', createdAt: serverTimestamp() });
        b.set(doc(db, 'config', 'setup'), { done: true, at: serverTimestamp() });
        await b.commit();
        bootstrapping = false; handleUser(cred.user);
      } catch (err) {
        bootstrapping = false; msg.hidden = false; msg.textContent = errText(err);
        if (auth.currentUser) signOut(auth);
      }
    };
  }

  /* ---------- Pelit ---------- */
  function gamesView() {
    frame('pelit', `
      <section class="card form">
        <h2>Uusi peli</h2>
        <div class="row">
          <div style="flex:2 1 260px" class="form"><label for="gt">Pelin nimi</label><input id="gt" maxlength="60" placeholder="Esim. Tiistain ryhmä"></div>
          <div style="flex:1 1 160px" class="form"><label for="gd">Arvioitu kesto</label>
            <select id="gd">${[5, 10, 15, 20, 30, 45, 60, 90].map(m => `<option value="${m}" ${m === 15 ? 'selected' : ''}>${m} min</option>`).join('')}</select></div>
        </div>
        <p class="note">Kesto ei näy kenellekään: se on arvio siitä, kauanko toiminta kestää. Maali tulee näkyviin noin minuuttia ennen arvioitua loppua, ja peli odottaa, että ryhmä ehtii maaliin.</p>
        <p class="err" id="gmsg" hidden></p>
        <button class="btn" id="gcreate">Luo peli ja näytä kutsu</button>
      </section>
      <section class="form">
        <div class="row" style="justify-content:space-between"><h2>${me.role === 'admin' ? 'Pelit' : 'Omat pelit'}</h2>
        ${me.role === 'admin' ? '<label class="row" style="font-size:1rem"><input type="checkbox" id="all" style="width:auto;min-height:0"> Näytä kaikkien ohjaajien pelit</label>' : ''}</div>
        <ul class="games" id="glist"><li class="muted">Ladataan…</li></ul>
      </section>`);
    document.getElementById('gcreate').onclick = async () => {
      const title = cleanName(document.getElementById('gt').value, 60) || `Peli ${new Date().toLocaleDateString('fi-FI')}`;
      const durationMin = +document.getElementById('gd').value;
      try {
        const ref = await addDoc(collection(db, 'games'), { title, hostUid: me.uid, hostName: me.name, status: 'lobby', durationMin, createdAt: serverTimestamp(), startAt: null, endAt: null, stopPresses: 0, groupColor: null, bots: [], finishAt: null, abrupt: false, result: null });
        location.hash = 'peli-' + ref.id;
      } catch (err) { const m = document.getElementById('gmsg'); m.hidden = false; m.textContent = errText(err); }
    };
    const list = () => {
      const all = document.getElementById('all')?.checked;
      const q = all ? collection(db, 'games') : query(collection(db, 'games'), where('hostUid', '==', me.uid));
      getDocs(q).then(s => {
        const el = document.getElementById('glist'); if (!el) return;
        const gs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 30);
        const lab = { lobby: 'odottaa', running: 'käynnissä', ended: 'päättynyt' };
        el.innerHTML = gs.length ? gs.map(g => `<li><span><strong>${esc(g.title)}</strong> <span class="muted">· ${g.durationMin} min${all ? ' · ' + esc(g.hostName || '') : ''} · ${g.createdAt?.toDate ? g.createdAt.toDate().toLocaleString('fi-FI', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span></span>
          <span class="row"><span class="status ${g.status}">${lab[g.status] || ''}</span><button class="btn small ghost" data-open="${g.id}">Avaa</button></span></li>`).join('')
          : '<li class="muted">Ei vielä pelejä. Luo ensimmäinen peli yllä.</li>';
        el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { location.hash = 'peli-' + b.dataset.open; });
      }).catch(err => { const el = document.getElementById('glist'); if (el) el.innerHTML = `<li class="err">${esc(errText(err))}</li>`; });
    };
    document.getElementById('all')?.addEventListener('change', list);
    list();
  }

  /* ---------- Pelinäkymä (iso näyttö) ---------- */
  function gameView(id) {
    const gref = doc(db, 'games', id);
    const url = `${location.origin}${location.pathname}?peli=${encodeURIComponent(id)}${EMU ? '&emu' : ''}`;
    let g = null, players = [], playersLoaded = false, prev = null, shownState = null, ticker = null, ending = false, botTimer = 0, bots = null, lastBotWrite = '';
    frame('pelit', `<div id="gv" class="form" style="gap:20px"><p class="muted">Ladataan peliä…</p></div>`);
    const root = document.getElementById('gv');
    const canControl = () => g && (g.hostUid === me.uid || me.role === 'admin');
    const remaining = () => g?.endAt ? g.endAt.toMillis() - Date.now() : 0;
    const groupPts = () => players.reduce((a, p) => a + (p.points || 0), 0);
    // Maalivaihe alkaa noin minuuttia ennen arvioitua loppua; peli odottaa, että ryhmä ehtii maaliin
    const finalMinute = () => g?.status === 'running' && remaining() <= 60000;

    const u1 = onSnapshot(gref, s => {
      if (!s.exists()) { root.innerHTML = '<div class="card"><p>Peliä ei löytynyt.</p></div>'; return; }
      g = s.data();
      if (!bots || !canControl()) bots = Array.isArray(g.bots) ? g.bots.map(b => ({ ...b })) : [];
      render();
    }, err => { root.innerHTML = `<div class="card"><p class="err">${esc(errText(err))}</p></div>`; });
    const u2 = onSnapshot(collection(db, 'games', id, 'players'), s => {
      players = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.joinedAt?.toMillis?.() || 0) - (b.joinedAt?.toMillis?.() || 0));
      playersLoaded = true;
      if (prev && !s.metadata.hasPendingWrites) players.forEach(p => { const d = (p.points || 0) - (prev[p.id] ?? 0); if (d > 0 && g?.status === 'running') toast(cleanName(p.name) || 'Pelaaja', d); });
      prev = Object.fromEntries(players.map(p => [p.id, p.points || 0]));
      renderPlayers(); renderTrack(); tick();
    });
    ticker = setInterval(tick, 250);
    cleanup.push(u1, u2, () => clearInterval(ticker));

    function invite(size) {
      return `<div class="invite"><div class="qr ${size}" id="qr" aria-label="QR-koodi peliin"></div>
        <div class="form" style="flex:1 1 240px;gap:8px"><span class="label">Liity peliin: skannaa QR-koodi tai avaa linkki</span>
        <span class="link" id="lnk">${esc(url)}</span><button class="btn small ghost" id="copy">Kopioi linkki</button><span class="note" id="cmsg"></span></div></div>`;
    }
    function drawQR() {
      const el = document.getElementById('qr'); if (!el || !window.QRCode) return;
      el.innerHTML = ''; new window.QRCode(el, { text: url, width: 600, height: 600, correctLevel: window.QRCode.CorrectLevel.M });
      document.getElementById('copy').onclick = () => {
        const m = document.getElementById('cmsg');
        navigator.clipboard.writeText(url).then(() => m.textContent = 'Linkki kopioitu.').catch(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('lnk')); getSelection().removeAllRanges(); getSelection().addRange(r); m.textContent = 'Kopioi valittu linkki.'; });
      };
    }

    function render() {
      const state = g.status;
      if (state !== shownState || (state === 'ended' && root.dataset.result !== String(g.result))) {
        shownState = state; root.dataset.result = String(g.result);
        const back = `<button class="btn small ghost" id="back">← Pelit</button>`;
        if (state === 'lobby') {
          root.innerHTML = `<div class="row" style="justify-content:space-between">${back}<span class="status lobby">odottaa pelaajia</span></div>
            <div class="card"><h1>${esc(g.title)}</h1>${invite('big')}</div>
            <div class="card"><h2>Pelaajat (<span id="pc">0</span>)</h2><ul class="lobbylist" id="plist"></ul>
              <h3 style="margin:8px 0 0">Ryhmän väri: äänet</h3><div class="votes" id="votes"></div>
              ${canControl() ? `<button class="btn" id="startg">Aloita peli (${g.durationMin} min)</button>` : ''}<p class="err" id="gmsg" hidden></p></div>`;
          drawQR();
          document.getElementById('startg')?.addEventListener('click', start);
        } else if (state === 'running') {
          root.innerHTML = `<div class="row" style="justify-content:space-between">${back}<span class="status running">käynnissä</span></div>
            <div class="gamehead card"><div class="form" style="gap:6px"><h1>${esc(g.title)}</h1><span class="phase" id="phase"></span>
              ${canControl() ? `<div class="row"><button class="btn stop small" id="stopg"></button><span class="note" id="stopinfo"></span></div>` : ''}<p class="err" id="gmsg" hidden></p></div>
              ${invite('small')}</div>
            <div class="card"><h2>Kilpailu</h2><div class="track" id="track"></div></div>
            <div class="feed" id="feed" aria-live="polite"></div>`;
          drawQR();
          document.getElementById('stopg')?.addEventListener('click', stop);
        } else {
          const win = g.result === 'win';
          root.innerHTML = `<div class="row" style="justify-content:space-between">${back}<span class="status ended">päättynyt</span></div>
            <div class="card result ${win ? 'win' : 'lose'}"><h1>${win ? 'Ryhmä voitti!' : 'Tällä kertaa ryhmä ei ehtinyt maaliin ensimmäisenä'}</h1>
              <p class="muted">${esc(g.title)} · ryhmän pisteet <strong id="gp"></strong></p></div>
            <div class="card"><h2>Kilpailu</h2><div class="track" id="track"></div></div>
            <div class="feed" id="feed" aria-live="polite"></div>
            <button class="btn" id="newg">Uusi peli</button>`;
          document.getElementById('newg').onclick = () => { location.hash = 'pelit'; };
        }
        document.getElementById('back').onclick = () => { location.hash = 'pelit'; };
      }
      updateStop(); renderPlayers(); renderTrack(); tick();
    }

    function dot(c) { const col = TEAM_COLORS[c]; return col ? `<span class="cdot" style="background:${col.hex}" title="${col.name}"></span>` : ''; }

    function renderPlayers() {
      if (!g) return;
      const pl = document.getElementById('plist');
      if (pl) {
        document.getElementById('pc').textContent = players.length;
        pl.innerHTML = players.length ? players.map(p => `<li>${dot(p.color)}${esc(cleanName(p.name))}${canControl() ? ` <button class="x" data-kick="${p.id}" aria-label="Poista ${esc(cleanName(p.name))}">×</button>` : ''}</li>`).join('') : '<li class="muted">Odotetaan, että pelaajat liittyvät…</li>';
        pl.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => deleteDoc(doc(db, 'games', id, 'players', b.dataset.kick)).catch(() => { }));
        const v = document.getElementById('votes'), t = tally();
        v.innerHTML = Object.keys(TEAM_COLORS).map(k => `<span class="vote ${t[k] ? '' : 'zero'}">${dot(k)}${TEAM_COLORS[k].name} <strong>${t[k] || 0}</strong></span>`).join('');
      }
      const cb = document.getElementById('contrib');
      if (cb) cb.innerHTML = [...players].sort((a, b) => (b.points || 0) - (a.points || 0)).map(p => `<li>${esc(cleanName(p.name))} <strong>${p.points || 0}</strong></li>`).join('') || '<li class="muted">Ei pelaajia.</li>';
      const gp = document.getElementById('gp'); if (gp) gp.textContent = groupPts();
    }
    function tally() { const t = {}; players.forEach(p => { if (TEAM_COLORS[p.color]) t[p.color] = (t[p.color] || 0) + 1; }); return t; }

    /* Kilpailu: kaikkien pelaajien pisteet samaan ryhmän juoksijaan + 4 automaattista juoksijaa */
    function renderTrack() {
      const tr = document.getElementById('track'); if (!tr || !g) return;
      const gpts = groupPts(), list = [{ id: 'group', name: 'Ryhmä', color: g.groupColor || 'sininen', pts: gpts, group: true }, ...(bots || []).map((b, i) => ({ id: 'b' + i, ...b }))];
      const lead = Math.max(20, ...list.map(r => r.pts));
      const ended = shownState === 'ended', win = g.result === 'win';
      const F = g.finishAt, fin = !!F && (g.status === 'running' || ended);
      const leader = list.filter(r => !r.group).reduce((m, r) => !m || r.pts > m.pts ? r : m, null);
      if (tr.querySelectorAll('.lane').length !== list.length) {
        tr.innerHTML = list.map((r, i) => `<div class="lane ${r.group ? 'grouplane' : ''}" data-id="${r.id}"><span class="nm">${esc(r.name)}</span><div class="road"><span class="goal" aria-hidden="true">${i === 0 ? '<b>MAALI</b>' : ''}</span><span class="token" style="left:4%"><span class="knight"></span></span></div><span class="pts"></span></div>`).join('');
      }
      tr.classList.toggle('final', fin);
      tr.querySelectorAll('.lane').forEach((l, i) => {
        const r = list[i], col = TEAM_COLORS[r.color] || TEAM_COLORS.sininen;
        let pos = F ? 4 + 88 * Math.min(r.pts, F) / F : 4 + 80 * r.pts / lead;
        const tk0 = l.querySelector('.token'); tk0.style.transitionDelay = '';
        if (ended && win && F && gpts >= F) {
          if (r.group) pos = 97;                                    // el grupo cruza la meta
          else if (r === leader) { pos = 94.5; tk0.style.transitionDelay = '1s'; }   // el líder cruza justo después
        }
        // Carril del grupo: ficha verde → fondo marrón; en los demás casos, fondo verde.
        // Carriles de los automáticos: alternan marrón y verde a partir del del grupo.
        const gbg = g.groupColor === 'vihrea' ? 'brown' : 'green';
        const bg = r.group ? gbg : ((i % 2 === 1) === (gbg === 'green') ? 'brown' : 'green');
        l.classList.toggle('green', bg === 'green'); l.classList.toggle('brown', bg === 'brown');
        const tk = l.querySelector('.token'); tk.style.left = pos + '%'; tk.querySelector('.knight').style.background = col.hex;
        tk.setAttribute('aria-label', `${r.name}, ${col.name}`);
        l.querySelector('.nm').textContent = r.name;
        l.querySelector('.pts').textContent = r.group ? r.pts : '';
      });
    }

    function stepBots() {
      if (!bots || !bots.length || !playersLoaded) return;
      const gp = groupPts(), F = g.finishAt;
      // El automático más adelantado pelea con el grupo hasta que al grupo le faltan 4 casillas para la meta
      const leadIdx = bots.reduce((bi, b, i) => b.pts > bots[bi].pts ? i : bi, 0);
      const released = !!F && gp >= F - 4;
      bots.forEach((b, i) => {
        let np = b.pts;
        if (i === leadIdx) {
          if (!released) {
            // Líder: entre 2 casillas por detrás y 1 por delante del grupo
            if (Math.random() < 0.6) np += 1;
            np = Math.min(np, gp + 1);
            np = Math.max(np, b.pts, gp - 2);
          } else {
            // Faltan 4 casillas: el líder sigue al grupo justo 1 casilla por detrás
            np = Math.max(b.pts, gp - 1);
          }
        } else {
          // Resto: entre 0 y 8 casillas por detrás; cuando faltan 4 casillas, entre 1 y 8 por detrás
          if (Math.random() < 0.55) np += rnd(1, 2);
          np = Math.min(np, released ? gp - 1 : gp);
          np = Math.max(np, b.pts, gp - 8);
        }
        if (F) np = Math.min(np, Math.max(b.pts, F - 1));   // ningún automático cruza la meta antes que el grupo
        b.pts = np;
      });
      const key = JSON.stringify(bots.map(b => b.pts));
      if (key !== lastBotWrite) { lastBotWrite = key; updateDoc(gref, { bots }).catch(() => { }); }
      renderTrack();
    }

    function updateStop() {
      const b = document.getElementById('stopg'); if (!b) return;
      b.textContent = (g.stopPresses || 0) === 0 ? 'Stop: lopetus noin 5 min päästä' : 'Stop: −1 min';
      document.getElementById('stopinfo').textContent = (g.stopPresses || 0) > 0 ? `Stopia painettu ${g.stopPresses} kertaa.` : '';
    }

    function tick() {
      if (!g || g.status !== 'running') return;
      const ph = document.getElementById('phase');
      if (ph) ph.textContent = g.finishAt ? `Maali näkyy! Ryhmä tarvitsee vielä ${Math.max(0, g.finishAt - groupPts())} pistettä.` : 'Peli käynnissä';
      if (!canControl() || !playersLoaded) return;
      // Maalivaihe alkaa: maaliviiva sijoitetaan noin minuutin työn päähän johtajasta
      if (!g.finishAt && finalMinute() && !ending) {
        const mins = Math.max(1, (Date.now() - (g.startAt?.toMillis?.() || Date.now())) / 60000);
        const pace = groupPts() / mins, lead = Math.max(groupPts(), ...(bots || []).map(b => b.pts));
        const finishAt = lead + Math.max(4, Math.round(pace));
        g.finishAt = finishAt; updateDoc(gref, { finishAt }).catch(() => { g.finishAt = null; });
        renderTrack();
      }
      // Ryhmä ylitti maaliviivan: ryhmä voittaa
      if (g.finishAt && groupPts() >= g.finishAt && !ending) {
        ending = true; updateDoc(gref, { status: 'ended', result: 'win', abrupt: false }).catch(() => { ending = false; });
        return;
      }
      if (Date.now() > botTimer) { botTimer = Date.now() + 2500 + Math.random() * 2000; stepBots(); }
    }

    async function start() {
      const b = document.getElementById('startg'); b.disabled = true;
      const t = tally(), top = Math.max(0, ...Object.values(t));
      const cands = top > 0 ? Object.keys(t).filter(k => t[k] === top) : Object.keys(TEAM_COLORS);
      const groupColor = cands[Math.floor(Math.random() * cands.length)];
      // Los automáticos usan colores que se ven bien sobre verde y sobre marrón, y nunca el del grupo ni uno parecido
      const SIMILAR = { sininen: ['turkoosi'], turkoosi: ['sininen'], violetti: ['pinkki'], pinkki: ['violetti', 'punainen'], punainen: ['pinkki', 'oranssi'], oranssi: ['keltainen', 'punainen'], keltainen: ['oranssi'] };
      const avoid = [groupColor, ...(SIMILAR[groupColor] || [])];
      const others = ['sininen', 'turkoosi', 'violetti', 'pinkki', 'keltainen', 'musta'].filter(k => !avoid.includes(k)).sort(() => Math.random() - .5);
      bots = BOT_NAMES.map((name, i) => ({ name, color: others[i], pts: 0 }));
      try { await updateDoc(gref, { status: 'running', startAt: serverTimestamp(), endAt: Timestamp.fromMillis(Date.now() + g.durationMin * 60000), groupColor, bots }); }
      catch (err) { b.disabled = false; const m = document.getElementById('gmsg'); m.hidden = false; m.textContent = errText(err); }
    }

    async function stop() {
      const now = Date.now(), end = g.endAt.toMillis(), presses = g.stopPresses || 0;
      const newEnd = presses === 0 ? Math.min(end, now + 5 * 60000) : end - 60000;
      let upd;
      if (newEnd <= now) {
        // Peli katkaistaan äkillisesti: tulos ratkeaa tilanteen mukaan
        const gp = groupPts(), win = (bots || []).every(x => x.pts < gp) && (!g.finishAt || gp >= g.finishAt);
        upd = { status: 'ended', endAt: Timestamp.fromMillis(now), stopPresses: presses + 1, abrupt: true, result: win ? 'win' : 'lose' };
      } else upd = { endAt: Timestamp.fromMillis(newEnd), stopPresses: presses + 1 };
      try { await updateDoc(gref, upd); } catch (err) { const m = document.getElementById('gmsg'); m.hidden = false; m.textContent = errText(err); }
    }
  }

  /* ---------- Käyttäjät (vain ylläpitäjä) ---------- */
  function usersView() {
    frame('kayttajat', `
      <section class="card form">
        <h2>Uusi käyttäjä</h2>
        <form class="form" id="uf" novalidate>
          <div class="row">
            <div class="form" style="flex:1 1 220px"><label for="un">Nimi</label><input id="un" maxlength="40" required></div>
            <div class="form" style="flex:1 1 260px"><label for="ue">Sähköposti</label><input id="ue" type="email" required></div>
          </div>
          <div class="row">
            <div class="form" style="flex:1 1 220px"><label for="ur">Rooli</label><select id="ur"><option value="user">Ohjaaja (käyttäjä)</option><option value="admin">Ylläpitäjä</option></select></div>
            <div class="form" style="flex:1 1 260px"><label for="up">Väliaikainen salasana</label><div class="row" style="flex-wrap:nowrap"><input id="up" autocomplete="off" minlength="6" required><button type="button" class="btn small ghost" id="gen">Luo</button></div></div>
          </div>
          <p class="note">Anna tunnus ja väliaikainen salasana käyttäjälle itse. Salasanaa ei näytetä myöhemmin: se tallennetaan salattuna, ja käyttäjä voi vaihtaa sen Oma tili -sivulla.</p>
          <p class="err" id="umsg" hidden></p>
          <button class="btn" type="submit">Luo käyttäjä</button>
        </form>
      </section>
      <section class="card form">
        <h2>Käyttäjät</h2>
        <div class="tablewrap"><table class="tbl"><thead><tr><th>Nimi</th><th>Sähköposti</th><th>Rooli</th><th>Salasana</th></tr></thead><tbody id="ut"><tr><td colspan="4" class="muted">Ladataan…</td></tr></tbody></table></div>
        <p class="note" id="tmsg"></p>
      </section>
      <section class="card form">
        <h2>Ohjelman muokkaus</h2>
        <p>Ohjelman koodi ja kysymykset ovat GitHub-repositoriossa. Muutokset näkyvät sivulla, kun ne on tallennettu sinne.</p>
        ${REPO_URL ? `<a class="btn ghost" style="text-align:center;text-decoration:none" href="${esc(REPO_URL)}" target="_blank" rel="noopener">Avaa ohjelman koodi (GitHub)</a>` : '<p class="note">Lisää repositorion osoite tiedostoon js/firebase-config.js (REPO_URL), niin linkki näkyy tässä.</p>'}
      </section>`);
    const genPw = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const a = new Uint32Array(10); crypto.getRandomValues(a); return [...a].map(x => c[x % c.length]).join(''); };
    document.getElementById('gen').onclick = () => { document.getElementById('up').value = genPw(); };
    document.getElementById('up').value = genPw();
    document.getElementById('uf').onsubmit = async e => {
      e.preventDefault();
      const msg = document.getElementById('umsg'); msg.hidden = false; msg.className = 'err';
      const name = cleanName(document.getElementById('un').value, 40), email = document.getElementById('ue').value.trim(), role = document.getElementById('ur').value, pw = document.getElementById('up').value;
      if (!name || !email) { msg.textContent = 'Täytä nimi ja sähköposti.'; return; }
      // Uusi tunnus luodaan erillisellä yhteydellä, jotta ylläpitäjä pysyy kirjautuneena.
      const creator = makeApp('creator-' + Date.now());
      try {
        const cred = await createUserWithEmailAndPassword(creator.auth, email, pw);
        await setDoc(doc(db, 'users', cred.user.uid), { name, email, role, createdAt: serverTimestamp() });
        await signOut(creator.auth);
        msg.className = 'okmsg'; msg.textContent = `Käyttäjä luotu. Tunnus: ${email} · väliaikainen salasana: ${pw}`;
        document.getElementById('un').value = ''; document.getElementById('ue').value = ''; document.getElementById('up').value = genPw();
      } catch (err) { msg.textContent = errText(err); }
    };
    const unsub = onSnapshot(collection(db, 'users'), s => {
      const us = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'fi'));
      const tb = document.getElementById('ut'); if (!tb) return;
      tb.innerHTML = us.map(u => `<tr><td>${esc(u.name)}${u.id === me.uid ? ' <span class="note">(sinä)</span>' : ''}</td><td>${esc(u.email)}</td>
        <td><select data-role="${u.id}" ${u.id === me.uid ? 'disabled' : ''} aria-label="Rooli: ${esc(u.name)}">
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>Ohjaaja</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Ylläpitäjä</option><option value="disabled" ${u.role === 'disabled' ? 'selected' : ''}>Ei käytössä</option></select></td>
        <td><button class="btn small ghost" data-reset="${esc(u.email)}">Lähetä vaihtolinkki</button></td></tr>`).join('');
      tb.querySelectorAll('[data-role]').forEach(sel => sel.onchange = () => updateDoc(doc(db, 'users', sel.dataset.role), { role: sel.value })
        .then(() => { document.getElementById('tmsg').textContent = 'Rooli päivitetty.'; }).catch(err => { document.getElementById('tmsg').textContent = errText(err); }));
      tb.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => sendPasswordResetEmail(auth, b.dataset.reset)
        .then(() => { document.getElementById('tmsg').textContent = `Salasanan vaihtolinkki lähetettiin osoitteeseen ${b.dataset.reset}.`; }).catch(err => { document.getElementById('tmsg').textContent = errText(err); }));
    }, err => { const tb = document.getElementById('ut'); if (tb) tb.innerHTML = `<tr><td colspan="4" class="err">${esc(errText(err))}</td></tr>`; });
    cleanup.push(unsub);
  }

  /* ---------- Harjoitusten kokeilu (ei pisteitä peliin) ---------- */
  function practiceView() {
    frame('harjoittele', `<p class="note">Kokeilutila: harjoitukset vuorottelevat kuten pelissä, mutta pisteet eivät mene mihinkään peliin.</p>
      <div class="row"><label for="pl" class="label">Aloitustaso</label><select id="pl" style="width:auto">${[1, 2, 3, 4].map(l => `<option value="${l}">Taso ${l}</option>`).join('')}</select><button class="btn small" id="pgo">Aloita alusta</button></div>
      <div id="ex" class="form" style="gap:24px;max-width:640px;margin:0 auto;width:100%"></div>`);
    let ex = null;
    const go = () => { ex?.stop(); try { localStorage.removeItem('ah-off-harjoitus'); } catch (e) { } ex = createExercise(document.getElementById('ex'), { total: 10, startLevel: +document.getElementById('pl').value }); };
    document.getElementById('pgo').onclick = go; go();
    cleanup.push(() => ex?.stop());
  }

  /* ---------- Oma tili ---------- */
  function accountView() {
    frame('tili', `
      <form class="card form" id="pf" novalidate style="max-width:520px">
        <h2>Vaihda salasana</h2>
        <p class="muted">${esc(me.email)}</p>
        <label for="p0">Nykyinen salasana</label><input id="p0" type="password" autocomplete="current-password">
        <label for="p1">Uusi salasana (vähintään 6 merkkiä)</label><input id="p1" type="password" autocomplete="new-password">
        <label for="p2">Uusi salasana uudelleen</label><input id="p2" type="password" autocomplete="new-password">
        <p class="err" id="pmsg" hidden></p>
        <button class="btn" type="submit">Vaihda salasana</button>
      </form>`);
    document.getElementById('pf').onsubmit = async e => {
      e.preventDefault();
      const m = document.getElementById('pmsg'); m.hidden = false; m.className = 'err';
      const p0 = document.getElementById('p0').value, p1 = document.getElementById('p1').value, p2 = document.getElementById('p2').value;
      if (p1 !== p2) { m.textContent = 'Uudet salasanat eivät ole samat.'; return; }
      try {
        await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(me.email, p0));
        await updatePassword(auth.currentUser, p1);
        m.className = 'okmsg'; m.textContent = 'Salasana vaihdettu.'; e.target.reset();
      } catch (err) { m.textContent = errText(err); }
    };
  }
}

/* ===================================================================== */
/* PELAAJA: tulee peliin kutsulinkillä, ei voi muuttaa mitään muuta       */
/* ===================================================================== */
function playerMain(gameId) {
  // Oma Firebase-yhteys, jotta saman selaimen ohjaajan kirjautuminen ei sekoitu pelaajaan.
  const { auth, db } = makeApp('player');
  const gref = doc(db, 'games', gameId);
  let g = null, me = null, uid = null, ex = null, view = null, ticker = null, unsubMe = null, joinedOnce = false;
  const isOver = () => g && g.status === 'ended';
  let level = 1; try { level = Math.min(4, Math.max(1, +localStorage.getItem('ah-level') || 1)); } catch (e) { }

  const unAuth = onAuthStateChanged(auth, async u => {
    if (!u) { try { await signInAnonymously(auth); } catch (e) { show('error', errText(e)); } return; }
    unAuth(); uid = u.uid;
    onSnapshot(gref, s => {
      if (!s.exists()) return show('notfound');
      g = s.data(); update();
    }, () => show('notfound'));
    unsubMe = onSnapshot(doc(db, 'games', gameId, 'players', uid), s => {
      me = s.exists() ? s.data() : null;
      if (me) joinedOnce = true;
      update();
    });
  });

  function update() {
    if (!g) return;
    if (!me && joinedOnce) return show('removed');
    if (isOver()) return show(me ? 'ended' : 'closed');
    if (!me) return show('join');
    if (g.status === 'lobby') return show('lobby');
    return show('play');
  }

  function bar() { const c = TEAM_COLORS[g?.groupColor]; return `<div class="pbar"><span>${c ? `<span class="cdot" style="background:${c.hex}" title="Ryhmän väri: ${c.name}"></span>` : ''}<strong>${esc(me?.name || '')}</strong> · toit ryhmälle ${me?.points || 0} p</span>${g?.finishAt ? '<span class="pfin">Maali näkyy – vielä vähän!</span>' : ''}</div>`; }

  function show(v, extra) {
    if (v === view && v === 'play') { const b = document.getElementById('pbar'); if (b) b.innerHTML = bar(); ex?.refreshStatus(); return; }
    if (v === view && v === 'ended' && app.dataset.res === String(g?.result)) return;
    if (v === view && v !== 'lobby' && v !== 'ended') return;
    app.dataset.res = String(g?.result);
    if (view === 'play' && v !== 'play') { ex?.stop(); ex = null; }
    view = v;
    if (v === 'notfound') app.innerHTML = `<div class="card"><h1>Peliä ei löytynyt</h1><p>Tarkista linkki tai pyydä ohjaajalta uusi QR-koodi.</p></div>`;
    else if (v === 'error') app.innerHTML = `<div class="card"><h1>Yhteysvirhe</h1><p>${esc(extra || '')}</p></div>`;
    else if (v === 'closed') app.innerHTML = `<div class="card"><h1>Peli on päättynyt</h1><p>Tähän peliin ei voi enää liittyä.</p></div>`;
    else if (v === 'removed') app.innerHTML = `<div class="card"><h1>Et ole enää pelissä</h1><p>Ohjaaja poisti sinut pelistä. Kysy ohjaajalta, jos tämä oli vahinko.</p></div>`;
    else if (v === 'ended') app.innerHTML = `<div class="card" style="align-items:center;text-align:center"><h1>${g.result === 'win' ? 'Ryhmä voitti!' : 'Peli päättyi!'}</h1><p class="muted">${esc(me.name)}, toit ryhmälle</p><p class="big">${me.points || 0}</p><p class="muted">pistettä. Kiitos, hyvää työtä!</p></div>`;
    else if (v === 'join') {
      let saved = ''; try { saved = localStorage.getItem('ah-name') || ''; } catch (e) { }
      const voting = g.status === 'lobby';
      app.innerHTML = `<div><h1>${esc(g.title)}</h1><p class="muted">Tervetuloa peliin! Kirjoita nimesi. Se näkyy yhteisellä näytöllä.</p></div>
        <form class="card form" id="jf" novalidate><label for="nm">Nimi</label><input id="nm" class="namein" maxlength="24" autocomplete="off" value="${esc(saved)}" placeholder="Esim. Anna">
        <fieldset class="colors"><legend class="label">Valitse oma aloitustaso</legend><div class="lvlrow">${[1, 2, 3, 4].map(l => `<label class="sw lvsw"><input type="radio" name="lv" value="${l}" ${l === level ? 'checked' : ''}><span class="lvn">${l}</span></label>`).join('')}</div>
        <p class="note">1 = helpoin · 4 = vaikein. Taso muuttuu pelin aikana itsestään.</p></fieldset>
        ${voting ? `<fieldset class="colors"><legend class="label">Äänestä ryhmän väriä</legend><div class="swatches">${Object.entries(TEAM_COLORS).map(([k, c], i) => `<label class="sw"><input type="radio" name="col" value="${k}" ${i === 0 ? '' : ''}><span class="swc" style="background:${c.hex}"></span><span>${c.name}</span></label>`).join('')}</div></fieldset>` : ''}
        <p class="err" id="jmsg" hidden></p><button class="btn" type="submit">Liity peliin</button></form>`;
      document.getElementById('jf').onsubmit = async e => {
        e.preventDefault();
        const name = cleanName(document.getElementById('nm').value), m = document.getElementById('jmsg');
        if (!name) { m.hidden = false; m.textContent = 'Kirjoita ensin nimi.'; return; }
        const col = document.querySelector('input[name=col]:checked')?.value || null;
        if (voting && !col) { m.hidden = false; m.textContent = 'Valitse vielä väri.'; return; }
        level = +(document.querySelector('input[name=lv]:checked')?.value || 1);
        try { localStorage.setItem('ah-name', name); localStorage.setItem('ah-level', String(level)); } catch (e2) { }
        try { await setDoc(doc(db, 'games', gameId, 'players', uid), { name, color: col, points: 0, joinedAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
        catch (err) { m.hidden = false; m.textContent = err?.code === 'permission-denied' ? 'Peliin ei voi liittyä juuri nyt.' : errText(err); }
      };
    } else if (v === 'lobby') {
      const c = TEAM_COLORS[me.color];
      app.innerHTML = `<div class="card wait"><div class="pulse" aria-hidden="true"></div><h1>Hei ${esc(me.name)}!</h1><p>Odota hetki, peli alkaa pian. Ohjaaja käynnistää pelin.</p>${c ? `<p class="row" style="justify-content:center">Äänestit väriä <span class="cdot big" style="background:${c.hex}"></span> <strong>${c.name}</strong></p>` : ''}</div>`;
    } else if (v === 'play') {
      app.innerHTML = `<div id="pbar">${bar()}</div><div id="ex" class="form" style="gap:24px"></div>`;
      ex = createExercise(document.getElementById('ex'), {
        startLevel: level, storageKey: gameId,
        onCorrect: lvl => updateDoc(doc(db, 'games', gameId, 'players', uid), { points: increment(lvl), updatedAt: serverTimestamp() }).then(() => true).catch(() => { update(); return false; }),
      });
    }
  }

}
