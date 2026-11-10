/* Harjoitusmoottori: muisti, luokittelu ja tarkkaavuus sekoitettuina.
 * Harjoitukset vuorottelevat satunnaisesti, mutta samaa harjoitusta tulee korkeintaan 2 kertaa peräkkäin.
 * Jokaisella harjoituksella on oma tasonsa: kaikki alkavat samalta tasolta, mutta muuttuvat erikseen.
 * Säännöt: 2 oikein peräkkäin → taso ylös · 2 väärin peräkkäin → taso alas.
 * Oikea vastaus antaa yhtä monta pistettä kuin tason numero. */
import { BANK } from './bank.js';

const UP = 2, DOWN = 2, MAXL = 4;
const EXPOSE_S = 3; // tarkkaavuus, taso 4: rivin näkyvyysaika sekunteina
const VOWELS = ['A', 'E', 'I', 'O', 'U'];

export const SKILLS = {
  muisti: { name: 'Muisti', help: 'Lue sana tai lista rauhassa. Kun olet valmis, se piilotetaan ja vastaat kysymykseen.', lv: '1 = yksi asia · 4 = neljä asiaa.' },
  luokittelu: { name: 'Luokittelu', help: 'Katso sanoja ja mieti, mitkä kuuluvat samaan ryhmään.', lv: '1 = selvät ryhmät · 4 = ominaisuudet, esim. kylmät tai kuumat asiat.' },
  tarkkaavuus: { name: 'Tarkkaavuus', help: 'Katso kuvioita tarkasti ja laske, montako pyydettyä löydät. Tasolla 4 rivi näkyy vain hetken.', lv: '1 = kuviot · 2 = kuviot eri väreissä · 3 = kirjaimet ja numerot eri väreissä · 4 = sama, mutta näkyvissä vain hetken.' },
};

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* Laitteella jo kysytyt kysymykset muistetaan, jotta samat eivät toistu kierrosten välillä */
const used = new Set();
try { JSON.parse(localStorage.getItem('ah-used') || '[]').forEach(i => used.add(i)); } catch (e) { }
const saveUsed = () => { try { localStorage.setItem('ah-used', JSON.stringify([...used])); } catch (e) { } };

/* ===== Tarkkaavuus: tehtävät luodaan automaattisesti ===== */
const SHAPES = {
  ympyra: { n: 'ympyrää', svg: '<circle cx="24" cy="24" r="19"/>' },
  nelio: { n: 'neliötä', svg: '<rect x="6" y="6" width="36" height="36" rx="3"/>' },
  kolmio: { n: 'kolmiota', svg: '<polygon points="24,4 45,43 3,43"/>' },
  tahti: { n: 'tähteä', svg: '<polygon points="24,2 30,17 46,17 33,27 38,44 24,34 10,44 15,27 2,17 18,17"/>' },
};
const COLORS = ['var(--s-red)', 'var(--s-blue)', 'var(--s-yellow)', 'var(--s-green)', 'var(--s-purple)', 'var(--s-orange)'];
const rcol = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const shp = (k, c) => `<svg viewBox="0 0 48 48" aria-hidden="true"><g style="fill:${c}">${SHAPES[k].svg}</g></svg>`;
function countOpts(c, n, k) { const cand = shuffle([c - 1, c + 1, c - 2, c + 2, c + 3].filter(x => x >= 0 && x <= n)); return [c, ...cand.slice(0, k - 1)].map(String); }

function genAttention(lvl) {
  let items, q, c, n;
  if (lvl === 1) {
    const types = shuffle(Object.keys(SHAPES)).slice(0, 3), t = types[0];
    n = 8; c = rnd(2, 5);
    items = shuffle([...Array(c).fill(t), ...Array.from({ length: n - c }, () => types[rnd(1, 2)])]).map(x => shp(x, 'var(--accent)'));
    q = `Montako ${SHAPES[t].n} näet?`;
  } else if (lvl === 2) {
    const types = shuffle(Object.keys(SHAPES)), t = types[0];
    n = 10; c = rnd(2, 5);
    items = shuffle([...Array(c).fill(t), ...Array.from({ length: n - c }, () => types[rnd(1, 3)])]).map(x => shp(x, rcol()));
    q = `Montako ${SHAPES[t].n} näet?`;
  } else {
    const letters = Math.random() < .5;
    const sets = letters ? [['A', 'Ä', 'O', 'Ö'], ['O', 'Ö', 'Q', 'C'], ['E', 'F', 'B', 'P'], ['M', 'N', 'W', 'H']] : [['6', '9', '8', '0'], ['3', '8', '5', '9'], ['1', '7', '4', '2']];
    const set = sets[rnd(0, sets.length - 1)], t = set[0];
    n = 14; c = rnd(3, 6);
    items = shuffle([...Array(c).fill(t), ...Array.from({ length: n - c }, () => set[rnd(1, set.length - 1)])]).map(x => `<span class="ch" style="color:${rcol()}">${x}</span>`);
    q = letters ? `Montako kertaa näet kirjaimen ${t}?` : `Montako kertaa näet numeron ${t}?`;
  }
  return { skill: 'tarkkaavuus', level: lvl, type: 'direct', q, expose: lvl === 4 ? EXPOSE_S : 0, options: countOpts(c, n, 4), html: `<div class="stim" role="img" aria-label="Kuviorivi">${items.join('')}</div>`, id: -1 };
}

/**
 * Käynnistää sekoitetun harjoituksen elementtiin `root`.
 * opts.startLevel        kaikkien harjoitusten aloitustaso (1–4)
 * opts.onCorrect(level)  → Promise<boolean>  pisteiden lähetys
 * opts.total             tehtävien määrä (Infinity = jatkuu kunnes peli loppuu)
 * opts.storageKey        avain, jolla muistetaan pelaajan poistamat harjoitukset (esim. pelin tunnus)
 * Palauttaa { stop(), refreshStatus() }
 */
export function createExercise(root, opts = {}) {
  const start = Math.min(MAXL, Math.max(1, +opts.startLevel || 1));
  const total = opts.total ?? Infinity;
  const skey = 'ah-off-' + (opts.storageKey || 'harjoitus');
  let off = []; try { off = JSON.parse(localStorage.getItem(skey) || '[]').filter(k => SKILLS[k]); } catch (e) { }
  const st = Object.fromEntries(Object.keys(SKILLS).map(k => [k, { level: start, ok: 0, bad: 0, lastId: null }]));
  const run = { n: 0, points: 0, sendFail: 0, history: [], cur: null, expTimer: null };
  let stopped = false;

  const active = () => Object.keys(SKILLS).filter(k => !off.includes(k));
  function nextSkill() {
    const act = active(), h = run.history;
    // Samaa harjoitusta korkeintaan 2 kertaa peräkkäin
    const blocked = h.length >= 2 && h[h.length - 1] === h[h.length - 2] ? h[h.length - 1] : null;
    const pool = act.filter(k => k !== blocked);
    return (pool.length ? pool : act)[Math.floor(Math.random() * (pool.length ? pool.length : act.length))];
  }

  const dots = level => { let h = `<span class="levels" aria-label="Taso ${level}/${MAXL}">Taso ${level} `; for (let i = 1; i <= MAXL; i++) h += `<span class="dot${i <= level ? ' on' : ''}"></span>`; return h + '</span>'; };
  const statusText = () => [isFinite(total) ? `Tehtävä ${Math.min(run.n + 1, total)} / ${total}` : null, `${run.points} p`].filter(Boolean).map(esc).join(' · ');
  const header = () => { const q = run.cur; return `<div class="top"><span class="skilltag">${esc(SKILLS[q.skill].name)}</span>${dots(st[q.skill].level)}<span class="progress" id="ex-status">${statusText()}</span></div>`; };
  const removeBtn = q => q.skill === 'tarkkaavuus' && active().length > 1
    ? `<div id="ex-rm"><button class="btn ghost" id="ex-rmbtn">En näe kuvioita hyvin – poista tämä harjoitus</button></div>` : '';

  function pick(skill) {
    const level = st[skill].level;
    if (skill === 'tarkkaavuus') return genAttention(level);
    const pool = BANK.filter(b => b.level === level && b.skill === skill);
    let fresh = pool.filter(b => !used.has(b.id));
    if (!fresh.length) { pool.forEach(b => used.delete(b.id)); fresh = pool.filter(b => b.id !== st[skill].lastId); if (!fresh.length) fresh = pool; }
    const q = { ...fresh[Math.floor(Math.random() * fresh.length)] };
    used.add(q.id); st[skill].lastId = q.id; saveUsed(); return q;
  }

  function bindRemove() {
    const b = root.querySelector('#ex-rmbtn'); if (!b) return;
    b.onclick = () => {
      const box = root.querySelector('#ex-rm');
      box.innerHTML = `<div class="card" style="gap:12px"><p><strong>Poistetaanko tarkkaavuustehtävät?</strong> Saat sen jälkeen vain muisti- ja luokittelutehtäviä.</p><div class="confirmrow"><button class="btn" id="ex-rmyes">Kyllä, poista</button><button class="btn ghost" id="ex-rmno">Ei</button></div></div>`;
      root.querySelector('#ex-rmno').onclick = () => { box.innerHTML = removeBtn(run.cur); bindRemove(); };
      root.querySelector('#ex-rmyes').onclick = () => {
        off = [...new Set([...off, 'tarkkaavuus'])]; try { localStorage.setItem(skey, JSON.stringify(off)); } catch (e) { }
        clearInterval(run.expTimer); run.history.push('tarkkaavuus'); next();
      };
    };
  }

  function next() {
    if (stopped) return;
    if (run.n >= total) return finished();
    const skill = nextSkill(); run.history.push(skill);
    const q = pick(skill); run.cur = q;
    if (q.type === 'direct') return ask();
    const body = q.type === 'list' ? `<div class="memory list">${q.show.map(esc).join('<br>')}</div>` : `<div class="memory">${esc(q.show)}</div>`;
    root.innerHTML = `${header()}<div class="card"><p class="muted">Lue ja muista.</p>${body}<button class="btn" id="ex-ready">Olen valmis</button></div>`;
    const b = root.querySelector('#ex-ready'); b.focus(); b.onclick = ask;
  }

  function ask() {
    if (stopped) return;
    const q = run.cur;
    if (q.expose && !q.started) {
      root.innerHTML = `${header()}<div class="card"><p class="muted">Lue kysymys ensin. Rivi näkyy vain ${q.expose} sekuntia.</p><h2>${esc(q.q)}</h2><button class="btn" id="ex-showrow">Olen valmis, näytä rivi</button></div>${removeBtn(q)}`;
      const b = root.querySelector('#ex-showrow'); b.focus(); b.onclick = () => { q.started = true; ask(); };
      bindRemove(); return;
    }
    const o = shuffle(q.options);
    root.innerHTML = `${header()}<div class="card"><h2>${esc(q.q)}</h2>${q.html || ''}<div class="opts">${o.map((x, i) => `<button class="opt" data-v="${esc(x)}" data-k="${VOWELS[i]}"><span class="key" aria-hidden="true">${VOWELS[i]}</span><span>${esc(x)}</span></button>`).join('')}</div><div id="ex-fb"></div></div>${removeBtn(q)}`;
    root.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(b));
    bindRemove();
    clearInterval(run.expTimer);
    if (q.expose) {
      const stim = root.querySelector('.stim'); let left = q.expose;
      stim.insertAdjacentHTML('beforebegin', `<div class="exp" id="ex-exp"><div class="expbar"><span id="ex-fill" style="width:100%"></span></div><span id="ex-left">${left} s</span></div>`);
      requestAnimationFrame(() => { const f = root.querySelector('#ex-fill'); if (f) f.style.width = ((left - 1) / q.expose * 100) + '%'; });
      run.expTimer = setInterval(() => {
        left--; const f = root.querySelector('#ex-fill'), t = root.querySelector('#ex-left');
        if (left <= 0) {
          clearInterval(run.expTimer); root.querySelector('#ex-exp')?.remove();
          if (stim.isConnected) { stim.className = 'stim gone'; stim.removeAttribute('role'); stim.textContent = 'Rivi piilotettiin. Vastaa sen mukaan, mitä ehdit laskea.'; }
          return;
        }
        if (t) t.textContent = left + ' s'; if (f) f.style.width = ((left - 1) / q.expose * 100) + '%';
      }, 1000);
    }
  }

  function answer(btn) {
    clearInterval(run.expTimer); root.querySelector('#ex-exp')?.remove(); root.querySelector('#ex-rm')?.remove();
    const q = run.cur, s = st[q.skill], correct = q.options[0], ok = btn.dataset.v === correct, lvl = s.level;
    let ck = ''; root.querySelectorAll('.opt').forEach(b => { b.disabled = true; if (b.dataset.v === correct) { b.classList.add('right'); ck = b.dataset.k; } });
    if (!ok) btn.classList.add('picked-wrong');
    let msg = ok ? `Oikein, hienoa! +${lvl} ${lvl === 1 ? 'piste' : 'pistettä'}.` : `Ei aivan. Oikea vastaus oli ${ck}: ${correct}`;
    if (ok) {
      run.points += lvl;
      if (opts.onCorrect) Promise.resolve(opts.onCorrect(lvl)).then(r => { if (r === false) run.sendFail++; }).catch(() => run.sendFail++);
      s.ok++; s.bad = 0;
      if (s.ok >= UP && s.level < MAXL) { s.level++; s.ok = 0; }
    } else {
      s.bad++; s.ok = 0;
      if (s.bad >= DOWN && s.level > 1) { s.level--; s.bad = 0; }
    }
    run.n++;
    const el = root.querySelector('#ex-status'); if (el) el.innerHTML = statusText();
    root.querySelector('#ex-fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'soft'}">${esc(msg)}</div><button class="btn" id="ex-next" style="margin-top:16px">${run.n >= total ? 'Valmis' : 'Seuraava'}</button>`;
    const b = root.querySelector('#ex-next'); b.focus(); b.onclick = next;
  }

  function finished() {
    const rows = Object.keys(SKILLS).map(k => `<li><span>${esc(SKILLS[k].name)}${off.includes(k) ? ' (poistettu)' : ''}</span><span>taso ${st[k].level}</span></li>`).join('');
    root.innerHTML = `<div class="card" style="align-items:center;text-align:center"><h2>Valmis!</h2><p class="muted">Pisteet</p><p class="big">${run.points}</p></div>
      <div class="card"><h2>Tasot nyt</h2><ul class="lb">${rows}</ul></div>`;
  }

  next();
  return {
    stop() { stopped = true; clearInterval(run.expTimer); },
    refreshStatus() { const el = root.querySelector('#ex-status'); if (el) el.innerHTML = statusText(); },
    get points() { return run.points; },
    get levels() { return Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v.level])); },
  };
}
