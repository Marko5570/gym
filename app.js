/* ---------- Speicher ---------- */
const KEY = 'gym.v1';
const seed = () => ({
  plans: [
    { id: uid(), name: 'Push', ex: [
      { name: 'Bankdrücken', sets: 4, reps: 8, weight: 60, rest: 120 },
      { name: 'Schrägbank Kurzhantel', sets: 3, reps: 10, weight: 22, rest: 90 },
      { name: 'Schulterdrücken', sets: 3, reps: 10, weight: 30, rest: 90 },
      { name: 'Trizepsdrücken Kabel', sets: 3, reps: 12, weight: 25, rest: 60 },
    ]},
    { id: uid(), name: 'Pull', ex: [
      { name: 'Klimmzüge', sets: 4, reps: 8, weight: 0, rest: 120 },
      { name: 'Langhantelrudern', sets: 4, reps: 10, weight: 50, rest: 90 },
      { name: 'Latzug', sets: 3, reps: 12, weight: 55, rest: 90 },
      { name: 'Bizeps Curls', sets: 3, reps: 12, weight: 15, rest: 60 },
    ]},
    { id: uid(), name: 'Beine', ex: [
      { name: 'Kniebeugen', sets: 4, reps: 8, weight: 80, rest: 150 },
      { name: 'Rumänisches Kreuzheben', sets: 3, reps: 10, weight: 70, rest: 120 },
      { name: 'Beinpresse', sets: 3, reps: 12, weight: 120, rest: 90 },
      { name: 'Wadenheben', sets: 4, reps: 15, weight: 60, rest: 45 },
    ]},
  ],
  sessions: [],
  recipes: [
    { id: uid(), name: 'Protein-Overnight-Oats', tags: ['Frühstück','Meal Prep'],
      kcal: 520, p: 38, c: 62, f: 12,
      ing: '80 g Haferflocken\n250 ml Milch\n30 g Whey Vanille\n1 EL Chiasamen\n100 g Beeren\n1 TL Honig',
      steps: '1. Alles außer Beeren in ein Glas geben und verrühren.\n2. Über Nacht in den Kühlschrank.\n3. Morgens Beeren obendrauf.' },
  ],
  bag: ['Handtuch','Trinkflasche','Shaker + Whey','Sportschuhe','Kopfhörer','Handgelenkbandagen','Wechselshirt','Duschzeug','Magnesium/Chalk','Schlüssel & Karte']
    .map(t => ({ id: uid(), label: t, on: false })),
  active: null,
  restDefault: 90,
});

let db;
try { db = JSON.parse(localStorage.getItem(KEY)) || seed(); }
catch { db = seed(); }
db.sessions.sort((a, b) => a.date - b.date);
const save = () => localStorage.setItem(KEY, JSON.stringify(db));

/* --- Automatische Sicherungspunkte ---
   Nach jedem Training (und spätestens alle 3 Tage) legt die App still eine
   Kopie ab. Rettet vor Fehlbedienung, nicht vor Geräteverlust — dafür gibt es
   den Export im Backup-Dialog. */
const SNAPKEY = 'gym.snapshots';
const MAXSNAP = 5;

function loadSnaps(){
  try { return JSON.parse(localStorage.getItem(SNAPKEY)) || []; } catch { return []; }
}
function autoSnapshot(reason){
  const json = JSON.stringify({ plans:db.plans, sessions:db.sessions, recipes:db.recipes,
                                bag:db.bag, restDefault:db.restDefault, lastBackup:db.lastBackup });
  const snaps = loadSnaps();
  if (snaps.length && snaps[snaps.length-1].json === json) return; // nichts geändert
  snaps.push({ ts: Date.now(), reason, json });
  while (snaps.length > MAXSNAP) snaps.shift();
  // Safari deckelt den Speicher: im Zweifel lieber alte Punkte opfern als alles verlieren
  for (;;) {
    try { localStorage.setItem(SNAPKEY, JSON.stringify(snaps)); return; }
    catch {
      if (snaps.length <= 1) { localStorage.removeItem(SNAPKEY); return; }
      snaps.shift();
    }
  }
}

/* ---------- Helfer ---------- */
function uid(){ return Math.random().toString(36).slice(2,10); }
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const n = parseFloat(String(v).replace(',','.')); return isFinite(n) ? n : 0; };
const mmss = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const dateDE = ts => new Date(ts).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'});
function agoDE(ts){
  const d = Math.floor((Date.now()-ts)/86400000);
  return d <= 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`;
}
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 1900);
}
const CHECK = '<svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6.5"/></svg>';

/* ---------- Tabs ---------- */
let tab = 'training';
const TITLES = { training:'Training', verlauf:'Verlauf', rezepte:'Rezepte', tasche:'Gym-Tasche' };

document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  tab = b.dataset.tab;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
  $('#view').scrollTop = 0;
  render();
});

function render(){
  $('#title').textContent = db.active && tab === 'training' ? db.active.planName : TITLES[tab];
  const act = $('#topAction');
  const cfg = {
    training: db.active ? null : { label:'+ Plan', fn: () => editPlan(null) },
    verlauf:  { label:'Backup', fn: openBackup },
    rezepte:  { label:'+ Rezept', fn: () => editRecipe(null) },
    tasche:   { label:'+ Teil',   fn: addBagItem },
  }[tab];
  act.hidden = !cfg;
  if (cfg){ act.textContent = cfg.label; act.onclick = cfg.fn; }
  ({ training: viewTraining, verlauf: viewVerlauf, rezepte: viewRezepte, tasche: viewTasche })[tab]();
}

const emptyBox = (txt, sub) => `<div class="empty">
  <svg viewBox="0 0 24 24"><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/></svg>
  <p style="font-weight:700;color:var(--txt)">${esc(txt)}</p><p class="small">${esc(sub)}</p></div>`;

/* ================= TRAINING ================= */
function viewTraining(){
  db.active ? viewSession() : viewPlans();
}

// Erinnert erst, wenn wirklich etwas zu verlieren ist
function backupNag(){
  if (db.sessions.length < 3) return '';
  const days = db.lastBackup ? Math.floor((Date.now() - db.lastBackup) / 86400000) : null;
  if (days !== null && days < 14) return '';
  return `<div class="card tap nag" id="nag">
    <div class="row">
      <span class="nag-i">!</span>
      <div class="grow">
        <p style="font-weight:700">Daten sichern</p>
        <p class="small dim">${days === null
          ? 'Du hast noch nie gesichert. Deine Trainings liegen nur auf diesem iPhone.'
          : `Letzte Sicherung vor ${days} Tagen.`} Tippen zum Sichern.</p>
      </div>
    </div></div>`;
}

function viewPlans(){
  const last = {};
  db.sessions.forEach(s => { if (!last[s.planId] || s.date > last[s.planId]) last[s.planId] = s.date; });

  $('#view').innerHTML = backupNag() + (db.plans.length ? db.plans.map(p => `
    <div class="card">
      <div class="plan-h">
        <div class="grow">
          <p class="plan-n">${esc(p.name)}</p>
          <p class="small dim">${p.ex.length} Übungen${last[p.id] ? ' · zuletzt ' + agoDE(last[p.id]) : ''}</p>
        </div>
        <button class="ghost" data-edit="${p.id}">Bearbeiten</button>
      </div>
      <div style="margin:12px 0">
        ${p.ex.map(e => `<div class="ex-line"><span class="trunc">${esc(e.name)}</span>
          <span class="dim mono">${e.sets}×${e.reps}${e.weight ? ' · ' + e.weight + ' kg' : ''}</span></div>`).join('')}
      </div>
      <button class="btn wide" data-start="${p.id}">Training starten</button>
    </div>`).join('')
    : emptyBox('Noch keine Trainingspläne', 'Tippe oben rechts auf „+ Plan“.'));

  $('#view').querySelectorAll('[data-start]').forEach(b => b.onclick = () => startSession(b.dataset.start));
  $('#view').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editPlan(b.dataset.edit));
  const nag = $('#nag'); if (nag) nag.onclick = openBackup;
}

function startSession(planId){
  const p = db.plans.find(x => x.id === planId);
  const prev = [...db.sessions].reverse().find(s => s.planId === planId);
  db.active = {
    planId, planName: p.name, start: Date.now(),
    ex: p.ex.map(e => {
      const old = prev?.ex.find(o => o.name === e.name);
      return {
        name: e.name, rest: e.rest || db.restDefault,
        sets: Array.from({length: e.sets}, (_, i) => ({
          w: old?.sets[i]?.w ?? e.weight ?? 0,
          r: old?.sets[i]?.r ?? e.reps ?? 0,
          done: false,
        })),
      };
    }),
  };
  save(); render();
}

function viewSession(){
  const a = db.active;
  const el = (a.ex || []).map((e, i) => `
    <div class="card live">
      <div class="row between">
        <p style="font-weight:700">${esc(e.name)}</p>
        <span class="pill mono">${mmss(e.rest)} Pause</span>
      </div>
      <div class="hdr-lbl"><span>#</span><span>kg</span><span>Wdh</span><span></span></div>
      ${e.sets.map((s, j) => `
        <div class="set-row ${s.done ? 'done' : ''}">
          <span class="set-no">${j+1}</span>
          <input inputmode="decimal" value="${s.w}" data-f="w" data-i="${i}" data-j="${j}">
          <input inputmode="numeric" value="${s.r}" data-f="r" data-i="${i}" data-j="${j}">
          <button class="check ${s.done ? 'on' : ''}" data-tog="${i}.${j}">${CHECK}</button>
        </div>`).join('')}
      <div class="row" style="gap:8px;margin-top:12px">
        <button class="chip grow" data-addset="${i}">+ Satz</button>
        <button class="chip" data-delex="${i}">Übung entfernen</button>
      </div>
    </div>`).join('');

  const doneSets = a.ex.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
  const allSets  = a.ex.reduce((n, e) => n + e.sets.length, 0);

  $('#view').innerHTML = `
    <div class="stats">
      <div class="stat"><b class="mono" id="liveClock">00:00</b><span>DAUER</span></div>
      <div class="stat"><b class="mono">${doneSets}/${allSets}</b><span>SÄTZE</span></div>
      <div class="stat"><b class="mono">${Math.round(volumeOf(a))}</b><span>VOLUMEN KG</span></div>
    </div>
    ${el}
    <div class="stack" style="margin-top:16px">
      <button class="btn sec2 wide" id="addEx">+ Übung hinzufügen</button>
      <button class="btn wide" id="finish">Training beenden</button>
      <button class="btn danger wide" id="cancelS">Training verwerfen</button>
    </div>`;

  tickClock();
  const v = $('#view');
  v.querySelectorAll('input[data-f]').forEach(inp => inp.onchange = () => {
    const { f, i, j } = inp.dataset;
    a.ex[i].sets[j][f] = num(inp.value);
    save();
  });
  v.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => {
    const [i, j] = b.dataset.tog.split('.').map(Number);
    const s = a.ex[i].sets[j];
    s.done = !s.done;
    save(); render();
    if (s.done) startTimer(a.ex[i].rest);
  });
  v.querySelectorAll('[data-addset]').forEach(b => b.onclick = () => {
    const e = a.ex[b.dataset.addset], l = e.sets.at(-1);
    e.sets.push({ w: l?.w ?? 0, r: l?.r ?? 0, done: false });
    save(); render();
  });
  v.querySelectorAll('[data-delex]').forEach(b => b.onclick = () => {
    a.ex.splice(b.dataset.delex, 1); save(); render();
  });
  $('#addEx').onclick = () => {
    openModal('Übung hinzufügen', `
      <div class="field"><label>Name</label><input id="mN" placeholder="z. B. Beinstrecker"></div>
      <div class="f4">
        <div class="field"><label>Sätze</label><input id="mS" inputmode="numeric" value="3"></div>
        <div class="field"><label>Wdh</label><input id="mR" inputmode="numeric" value="10"></div>
        <div class="field"><label>kg</label><input id="mW" inputmode="decimal" value="0"></div>
        <div class="field"><label>Pause s</label><input id="mP" inputmode="numeric" value="${db.restDefault}"></div>
      </div>`, () => {
      const n = $('#mN').value.trim(); if (!n) return toast('Name fehlt');
      a.ex.push({ name: n, rest: num($('#mP').value) || db.restDefault,
        sets: Array.from({length: Math.max(1, num($('#mS').value))}, () => ({ w: num($('#mW').value), r: num($('#mR').value), done: false })) });
      save(); render(); return true;
    });
  };
  $('#finish').onclick = finishSession;
  $('#cancelS').onclick = () => { if (confirm('Training wirklich verwerfen?')) { db.active = null; save(); render(); } };
}

const volumeOf = a => a.ex.reduce((n, e) => n + e.sets.filter(s => s.done).reduce((m, s) => m + s.w * s.r, 0), 0);

function tickClock(){
  clearInterval(tickClock._i);
  const upd = () => {
    const n = $('#liveClock');
    if (!n || !db.active) return clearInterval(tickClock._i);
    n.textContent = mmss((Date.now() - db.active.start) / 1000);
  };
  upd(); tickClock._i = setInterval(upd, 1000);
}

function finishSession(){
  const a = db.active;
  const ex = a.ex.map(e => ({ name: e.name, sets: e.sets.filter(s => s.done) })).filter(e => e.sets.length);
  if (!ex.length) return toast('Kein Satz abgehakt');
  db.sessions.push({
    id: uid(), planId: a.planId, planName: a.planName, date: Date.now(),
    dur: Math.round((Date.now() - a.start) / 1000), volume: Math.round(volumeOf(a)), ex,
  });
  db.active = null; save();
  autoSnapshot('nach Training');
  toast('Training gespeichert 💪'); render();
}

/* ================= VERLAUF ================= */
let chartEx = null;

function viewVerlauf(){
  const S = db.sessions;
  if (!S.length){
    $('#view').innerHTML = emptyBox('Noch kein Training aufgezeichnet', 'Starte ein Training – hier erscheint dann dein Fortschritt.');
    return;
  }
  const weekAgo = Date.now() - 7 * 86400000;
  const names = [...new Set(S.flatMap(s => s.ex.map(e => e.name)))].sort((a,b) => a.localeCompare(b,'de'));
  if (!names.includes(chartEx)) chartEx = names[0];

  $('#view').innerHTML = `
    <div class="stats">
      <div class="stat"><b class="mono">${S.length}</b><span>TRAININGS</span></div>
      <div class="stat"><b class="mono">${S.filter(s => s.date > weekAgo).length}</b><span>DIESE WOCHE</span></div>
      <div class="stat"><b class="mono">${(S.reduce((n,s) => n + s.volume, 0)/1000).toFixed(1)}t</b><span>VOLUMEN</span></div>
    </div>

    <p class="sec">Fortschritt</p>
    <div class="card">
      <select id="exSel" style="margin-bottom:14px">
        ${names.map(n => `<option ${n === chartEx ? 'selected' : ''}>${esc(n)}</option>`).join('')}
      </select>
      ${chartFor(chartEx)}
    </div>

    <p class="sec">Trainings</p>
    ${[...S].reverse().map(s => `
      <div class="card tap" data-open="${s.id}">
        <div class="row between">
          <div class="grow">
            <p style="font-weight:700">${esc(s.planName)}</p>
            <p class="small dim">${dateDE(s.date)} · ${mmss(s.dur)} · ${s.volume} kg Volumen</p>
          </div>
          <span class="pill">${s.ex.length} Üb.</span>
        </div>
      </div>`).join('')}`;

  $('#exSel').onchange = e => { chartEx = e.target.value; viewVerlauf(); };
  $('#view').querySelectorAll('[data-open]').forEach(c => c.onclick = () => showSession(c.dataset.open));
}

function bestOf(sets){
  // geschätztes 1RM nach Epley, damit Sätze mit verschiedenen Wdh vergleichbar sind
  return Math.max(...sets.map(s => s.w * (1 + s.r / 30)), 0);
}

function chartFor(name){
  const pts = db.sessions
    .filter(s => s.ex.some(e => e.name === name))
    .map(s => ({ x: s.date, y: bestOf(s.ex.find(e => e.name === name).sets) }))
    .filter(p => p.y > 0);

  if (pts.length < 2)
    return `<p class="small dim" style="text-align:center;padding:26px 0">Mindestens 2 Trainings mit dieser Übung nötig, um eine Kurve zu zeichnen.</p>`;

  const W = 320, H = 165, PL = 34, PR = 8, PT = 12, PB = 22;
  const ys = pts.map(p => p.y), lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = (hi - lo) * .2 || Math.max(hi * .1, 1);
  const y0 = Math.max(0, lo - pad), y1 = hi + pad;
  const px = i => PL + (i / (pts.length - 1)) * (W - PL - PR);
  const py = v => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
  const line = pts.map((p,i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
  const area = `${line} L${(W-PR)} ${H-PB} L${PL} ${H-PB} Z`;
  const gain = ((pts.at(-1).y / pts[0].y - 1) * 100);

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff5a3c" stop-opacity=".32"/>
        <stop offset="1" stop-color="#ff5a3c" stop-opacity="0"/>
      </linearGradient></defs>
      ${[0,.5,1].map(f => { const y = PT + f*(H-PT-PB);
        return `<line class="grid" x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}"/>
                <text x="0" y="${y+3}">${Math.round(y1 - f*(y1-y0))}</text>`; }).join('')}
      <path class="ar" d="${area}"/><path class="ln" d="${line}"/>
      ${pts.map((p,i) => `<circle class="dot" cx="${px(i).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="3.2"/>`).join('')}
      <text x="${PL}" y="${H-6}">${dateDE(pts[0].x)}</text>
      <text x="${W-PR}" y="${H-6}" text-anchor="end">${dateDE(pts.at(-1).x)}</text>
    </svg>
    <p class="small dim" style="margin-top:10px">
      Geschätztes 1RM · ${pts.at(-1).y.toFixed(1)} kg aktuell ·
      <span style="color:${gain >= 0 ? 'var(--ok)' : '#ff6b6b'}">${gain >= 0 ? '+' : ''}${gain.toFixed(1)} %</span> seit Start
    </p>`;
}

function showSession(id){
  const s = db.sessions.find(x => x.id === id);
  openModal(s.planName, `
    <p class="small dim" style="margin-bottom:14px">${dateDE(s.date)} · ${mmss(s.dur)} · ${s.volume} kg Volumen</p>
    ${s.ex.map(e => `<div class="card">
      <p style="font-weight:700;margin-bottom:6px">${esc(e.name)}</p>
      ${e.sets.map((x,i) => `<div class="ex-line"><span class="dim">Satz ${i+1}</span>
        <span class="mono">${x.w} kg × ${x.r}</span></div>`).join('')}
    </div>`).join('')}
    <button class="btn danger wide" id="delS">Training löschen</button>`, null, 'Fertig');
  $('#delS').onclick = () => {
    if (!confirm('Dieses Training löschen?')) return;
    db.sessions = db.sessions.filter(x => x.id !== id); save(); closeModal(); render();
  };
}

/* ================= REZEPTE ================= */
function viewRezepte(){
  $('#view').innerHTML = db.recipes.length ? db.recipes.map(r => `
    <div class="card">
      <div class="row between">
        <p style="font-weight:700;font-size:17px" class="grow trunc">${esc(r.name)}</p>
        <button class="ghost" data-er="${r.id}">Bearbeiten</button>
      </div>
      ${r.tags?.length ? `<div class="tags">${r.tags.map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="macro">
        <div><b>${r.kcal||0}</b><span>KCAL</span></div>
        <div><b>${r.p||0}g</b><span>PROTEIN</span></div>
        <div><b>${r.c||0}g</b><span>KOHLENH.</span></div>
        <div><b>${r.f||0}g</b><span>FETT</span></div>
      </div>
      <button class="chip" style="margin-top:12px" data-tr="${r.id}">Zutaten & Zubereitung</button>
      <div id="rb-${r.id}" hidden>
        <p class="sec" style="margin-bottom:4px">Zutaten</p><div class="body-txt">${esc(r.ing)}</div>
        <p class="sec" style="margin-bottom:4px">Zubereitung</p><div class="body-txt">${esc(r.steps)}</div>
      </div>
    </div>`).join('')
    : emptyBox('Noch keine Rezepte', 'Tippe oben rechts auf „+ Rezept“.');

  $('#view').querySelectorAll('[data-tr]').forEach(b => b.onclick = () => {
    const box = $('#rb-' + b.dataset.tr);
    box.hidden = !box.hidden;
    b.classList.toggle('on', !box.hidden);
  });
  $('#view').querySelectorAll('[data-er]').forEach(b => b.onclick = () => editRecipe(b.dataset.er));
}

function editRecipe(id){
  const r = db.recipes.find(x => x.id === id) || { name:'', tags:[], kcal:0, p:0, c:0, f:0, ing:'', steps:'' };
  openModal(id ? 'Rezept bearbeiten' : 'Neues Rezept', `
    <div class="field"><label>Name</label><input id="rN" value="${esc(r.name)}" placeholder="z. B. Hähnchen-Reis-Bowl"></div>
    <div class="field"><label>Tags (Komma-getrennt)</label><input id="rT" value="${esc((r.tags||[]).join(', '))}" placeholder="Mittag, High Protein"></div>
    <div class="f4">
      <div class="field"><label>kcal</label><input id="rK" inputmode="numeric" value="${r.kcal||0}"></div>
      <div class="field"><label>Prot.</label><input id="rP" inputmode="numeric" value="${r.p||0}"></div>
      <div class="field"><label>KH</label><input id="rC" inputmode="numeric" value="${r.c||0}"></div>
      <div class="field"><label>Fett</label><input id="rF" inputmode="numeric" value="${r.f||0}"></div>
    </div>
    <div class="field"><label>Zutaten</label><textarea id="rI" placeholder="200 g Hähnchenbrust&#10;150 g Reis">${esc(r.ing)}</textarea></div>
    <div class="field"><label>Zubereitung</label><textarea id="rS" placeholder="1. Reis kochen …">${esc(r.steps)}</textarea></div>
    ${id ? '<button class="btn danger wide" id="rDel">Rezept löschen</button>' : ''}`,
  () => {
    const n = $('#rN').value.trim(); if (!n) return toast('Name fehlt');
    const o = { name:n, tags: $('#rT').value.split(',').map(t => t.trim()).filter(Boolean),
      kcal:num($('#rK').value), p:num($('#rP').value), c:num($('#rC').value), f:num($('#rF').value),
      ing:$('#rI').value, steps:$('#rS').value };
    if (id) Object.assign(r, o); else db.recipes.push({ id: uid(), ...o });
    save(); render(); return true;
  });
  if (id) $('#rDel').onclick = () => {
    if (!confirm('Rezept löschen?')) return;
    db.recipes = db.recipes.filter(x => x.id !== id); save(); closeModal(); render();
  };
}

/* ================= GYM-TASCHE ================= */
function viewTasche(){
  const on = db.bag.filter(b => b.on).length;
  $('#view').innerHTML = `
    <div class="card">
      <div class="row between" style="margin-bottom:6px">
        <p class="small dim">${on} von ${db.bag.length} eingepackt</p>
        <button class="ghost" id="reset">Zurücksetzen</button>
      </div>
      ${db.bag.map(b => `<div class="pack ${b.on ? 'on' : ''}">
        <div class="box" data-b="${b.id}">${CHECK}</div>
        <span class="lbl" data-b="${b.id}">${esc(b.label)}</span>
        <button class="del" data-d="${b.id}">×</button>
      </div>`).join('') || '<p class="dim small">Liste ist leer.</p>'}
    </div>`;

  $('#view').querySelectorAll('[data-b]').forEach(n => n.onclick = () => {
    const it = db.bag.find(x => x.id === n.dataset.b);
    it.on = !it.on; save(); render();
  });
  $('#view').querySelectorAll('[data-d]').forEach(n => n.onclick = e => {
    e.stopPropagation();
    db.bag = db.bag.filter(x => x.id !== n.dataset.d); save(); render();
  });
  $('#reset').onclick = () => { db.bag.forEach(b => b.on = false); save(); render(); };
}

function addBagItem(){
  openModal('Was kommt in die Tasche?', `<div class="field"><label>Bezeichnung</label>
    <input id="bN" placeholder="z. B. Zughilfen"></div>`, () => {
    const v = $('#bN').value.trim(); if (!v) return toast('Bezeichnung fehlt');
    db.bag.push({ id: uid(), label: v, on: false }); save(); render(); return true;
  });
}

/* ================= PLAN-EDITOR ================= */
function editPlan(id){
  const p = db.plans.find(x => x.id === id);
  let ex = p ? JSON.parse(JSON.stringify(p.ex)) : [{ name:'', sets:3, reps:10, weight:0, rest:db.restDefault }];

  const rows = () => ex.map((e,i) => `
    <div class="ex-edit">
      <div class="row" style="margin-bottom:8px">
        <input class="grow" data-p="name" data-i="${i}" value="${esc(e.name)}" placeholder="Übung">
        <button class="del" data-rm="${i}">×</button>
      </div>
      <div class="f4">
        <div><label class="small dim">Sätze</label><input inputmode="numeric" data-p="sets" data-i="${i}" value="${e.sets}"></div>
        <div><label class="small dim">Wdh</label><input inputmode="numeric" data-p="reps" data-i="${i}" value="${e.reps}"></div>
        <div><label class="small dim">kg</label><input inputmode="decimal" data-p="weight" data-i="${i}" value="${e.weight}"></div>
        <div><label class="small dim">Pause</label><input inputmode="numeric" data-p="rest" data-i="${i}" value="${e.rest}"></div>
      </div>
    </div>`).join('');

  const draw = () => {
    $('#modalBody').innerHTML = `
      <div class="field"><label>Name des Plans</label>
        <input id="pN" value="${esc(p?.name || '')}" placeholder="z. B. Push"></div>
      <p class="sec" style="margin-top:4px">Übungen</p>
      <div id="exList">${rows()}</div>
      <button class="btn sec2 wide" id="addRow" style="margin-bottom:10px">+ Übung</button>
      ${id ? '<button class="btn danger wide" id="pDel">Plan löschen</button>' : ''}`;

    const b = $('#modalBody');
    b.querySelectorAll('input[data-p]').forEach(inp => inp.oninput = () => {
      const { p:f, i } = inp.dataset;
      ex[i][f] = f === 'name' ? inp.value : num(inp.value);
    });
    b.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { ex.splice(x.dataset.rm,1); draw(); });
    $('#addRow').onclick = () => { ex.push({ name:'', sets:3, reps:10, weight:0, rest:db.restDefault }); draw(); };
    if (id) $('#pDel').onclick = () => {
      if (!confirm('Plan löschen?')) return;
      db.plans = db.plans.filter(x => x.id !== id); save(); closeModal(); render();
    };
  };

  openModal(id ? 'Plan bearbeiten' : 'Neuer Plan', '', () => {
    const n = $('#pN').value.trim(); if (!n) return toast('Name fehlt');
    const clean = ex.filter(e => e.name.trim());
    if (!clean.length) return toast('Mindestens eine Übung');
    if (p){ p.name = n; p.ex = clean; } else db.plans.push({ id: uid(), name:n, ex:clean });
    save(); render(); return true;
  });
  draw();
}

/* ================= BACKUP ================= */
function openBackup(){
  const json = JSON.stringify(db);
  openModal('Backup', `
    <p class="small dim" style="margin-bottom:16px">Deine Trainings, Rezepte und Pläne liegen ausschließlich auf diesem Gerät.
    Sichere sie ab und zu — damit bekommst du sie nach einem Handywechsel oder Löschen zurück.</p>
    <button class="btn wide" id="bkDl">Als Datei sichern</button>
    <button class="btn sec2 wide" id="bkCopy" style="margin-top:10px">Text kopieren</button>
    <div class="field" style="margin-top:16px"><label>Dein Backup</label>
      <textarea id="bkOut" readonly style="min-height:80px;font-size:12px">${esc(json)}</textarea></div>
    <p class="sec">Automatische Sicherungspunkte</p>
    <p class="small dim" style="margin-bottom:10px">Die App legt nach jedem Training selbst eine Kopie an
    – die letzten ${MAXSNAP}. Die liegen mit auf diesem Gerät, helfen also nur bei Fehlbedienung.</p>
    ${loadSnaps().map((s, i) => `<div class="row between" style="padding:9px 0;border-top:1px solid var(--line)">
      <div class="grow"><span class="small">${dateDE(s.ts)}</span>
      <span class="small dim"> · ${esc(s.reason)}</span></div>
      <button class="chip" data-snap="${i}">Laden</button></div>`).reverse().join('')
      || '<p class="small dim">Noch keine – der erste entsteht nach deinem nächsten Training.</p>'}
    <p class="sec">Backup einspielen</p>
    <div class="field"><label>Gesicherten Text einfügen</label>
      <textarea id="bkIn" style="min-height:80px;font-size:12px" placeholder="Gesicherten Text einfügen …"></textarea></div>
    <button class="btn danger wide" id="bkIn2">Daten ersetzen</button>`, null, 'Fertig');

  const marked = () => { db.lastBackup = Date.now(); save(); };
  $('#bkDl').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type:'application/json' }));
    a.download = `gym-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    marked();
  };
  $('#bkCopy').onclick = async () => {
    const ta = $('#bkOut');
    try { await navigator.clipboard.writeText(json); toast('Kopiert'); }
    catch { ta.focus(); ta.select(); toast('Markiert – jetzt „Kopieren“ wählen'); }
    marked();
  };
  $('#modalBody').querySelectorAll('[data-snap]').forEach(b => b.onclick = () => {
    const s = loadSnaps()[b.dataset.snap];
    if (!s || !confirm(`Stand vom ${dateDE(s.ts)} wiederherstellen? Die aktuellen Daten werden ersetzt.`)) return;
    localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(s.json), active: null }));
    location.reload();
  });
  $('#bkIn2').onclick = () => {
    let data;
    try { data = JSON.parse($('#bkIn').value); }
    catch { return toast('Das ist kein gültiges Backup'); }
    if (!Array.isArray(data.plans) || !Array.isArray(data.sessions)) return toast('Das ist kein gültiges Backup');
    if (!confirm('Alle aktuellen Daten werden durch das Backup ersetzt. Fortfahren?')) return;
    localStorage.setItem(KEY, JSON.stringify(data));
    location.reload();
  };
}

/* ================= PAUSEN-TIMER ================= */
let tState = null;
function startTimer(sec){
  if (!sec) return;
  tState = { left: sec, total: sec };
  $('#timer').hidden = false;
  paintTimer();
  clearInterval(startTimer._i);
  startTimer._i = setInterval(() => {
    tState.left--;
    paintTimer();
    if (tState.left <= 0) endTimer(true);
  }, 1000);
}
function paintTimer(){
  $('#timerTime').textContent = mmss(Math.max(0, tState.left));
  const C = 327;
  $('.ring-fg').style.strokeDashoffset = C * (1 - Math.max(0, tState.left) / tState.total);
}
function endTimer(alarm){
  clearInterval(startTimer._i);
  $('#timer').hidden = true; tState = null;
  if (!alarm) return;
  navigator.vibrate?.([200,90,200,90,320]);
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0,.28,.56].forEach(t => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(.001, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.35, ac.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + t + .2);
      o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .22);
    });
  } catch {}
}
$('#timerSkip').onclick = () => endTimer(false);
document.querySelectorAll('[data-adj]').forEach(b => b.onclick = () => {
  if (!tState) return;
  tState.left = Math.max(1, tState.left + +b.dataset.adj);
  tState.total = Math.max(tState.total, tState.left);
  paintTimer();
});

/* ================= MODAL ================= */
let onSave = null;
function openModal(title, body, saveFn, saveLabel){
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalSave').textContent = saveLabel || 'Sichern';
  $('#modalSave').hidden = false;
  onSave = saveFn || (() => true);
  $('#modal').hidden = false;
}
function closeModal(){ $('#modal').hidden = true; onSave = null; }
$('#modalCancel').onclick = closeModal;
$('#modalSave').onclick = () => { if (onSave?.() !== false) closeModal(); };
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

/* ================= Start ================= */
render();
{
  const last = loadSnaps().at(-1);
  if (!last || Date.now() - last.ts > 3 * 86400000) autoSnapshot('automatisch');
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
