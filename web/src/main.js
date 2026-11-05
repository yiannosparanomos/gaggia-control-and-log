import './fonts.css';
import './style.css';
(function () {
  const SIM = window.SIM_MODE === true || new URLSearchParams(location.search).has('sim');
  const MAX_S = 60, MIN_LIMIT = 5, MAX_LIMIT = 60, NDOTS = 30, DAY = 86400000;
  const $ = (id) => document.getElementById(id);
  const clamp = (v) => Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.round(v)));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  const SCALES = [
    { k: 'acid',    name: 'acidity.',    lo: 'low',   hi: 'bright' },
    { k: 'sweet',   name: 'sweetness.',  lo: 'low',   hi: 'high' },
    { k: 'bitter',  name: 'bitterness.', lo: 'none',  hi: 'harsh' },
    { k: 'body',    name: 'body.',       lo: 'thin',  hi: 'syrupy' },
    { k: 'finish',  name: 'finish.',     lo: 'short', hi: 'long' },
    { k: 'overall', name: 'overall.',    lo: 'miss',  hi: 'dialed in' },
  ];
  const NOTES = ['chocolate', 'caramel', 'nutty', 'red berries', 'citrus', 'floral', 'honey', 'spice', 'smoky', 'sour', 'astringent', 'watery'];
  const REASON = { limit: 'at the limit', manual: 'by you', safety: 'safety limit' };

  let S = { state: 'idle', elapsed: 0, limit: 30, auto: true, reason: '', last: [], presses: 0, storage: true };
  let statusAt = performance.now(), online = true, prevPresses = null, busy = false;
  let savedKey = null, brews = [], coffees = [], pendingDelete = null, pendingBean = null;
  let brewsLoaded = false, coffeesLoaded = false;

  // ---------- simulator (preview only; mirrors the ESP32) ----------
  const sim = { state: 'idle', start: 0, stop: 0, limit: 30, auto: true, reason: '', last: [], lastPress: -1e9, presses: 0, brews: [], coffees: [] };
  if (SIM) {
    const now = Date.now(), iso = (t) => new Date(t).toISOString().slice(0, 10);
    sim.coffees = [
      { id: 1, name: 'Colombia Huila', roaster: 'Third Place', roasted: iso(now - 9 * DAY), week: true, example: true },
      { id: 2, name: 'Ethiopia Guji', roaster: 'Third Place', roasted: iso(now - 4 * DAY), week: true, example: true },
      { id: 3, name: 'Kenya AA', roaster: 'Taf', roasted: iso(now - 40 * DAY), week: false, example: true },
    ];
    const mk = (daysAgo, coffee, grind, dose, yld, time, s, notes, comment) =>
      ({ id: now - daysAgo * DAY, ts: now - daysAgo * DAY, example: true, coffee, grind, dose, yield: yld, time, s, notes, comment });
    sim.brews = [
      mk(0.2, 'Ethiopia Guji', '10', 18, 37, 28.6, { acid: 4, sweet: 4, bitter: 1, body: 3, finish: 4, overall: 5 }, ['citrus', 'floral', 'honey'], 'Best one this week.'),
      mk(1, 'Colombia Huila', '11', 18, 38, 29.4, { acid: 3, sweet: 4, bitter: 2, body: 4, finish: 3, overall: 4 }, ['chocolate', 'caramel'], 'Nicely balanced. A touch finer next time.'),
      mk(2, 'Colombia Huila', '13', 18, 40, 22.1, { acid: 5, sweet: 2, bitter: 1, body: 2, finish: 2, overall: 2 }, ['sour', 'watery'], 'Ran far too fast.'),
      mk(5, 'Kenya AA', '12', 18, 36, 27.0, { acid: 4, sweet: 3, bitter: 2, body: 3, finish: 3, overall: 3 }, ['red berries'], ''),
    ];
  }
  if (SIM) window.gaggiaSim = sim;   // lets the GitHub Pages demo animate the machine
  function simElapsed() { return sim.state === 'brewing' ? performance.now() - sim.start : sim.state === 'done' ? sim.stop - sim.start : 0; }
  function simCanPress() { return performance.now() - sim.lastPress >= 1000; }
  function simPress() { sim.lastPress = performance.now(); sim.presses++; }
  function simStop(r) {
    if (sim.state !== 'brewing' || !simCanPress()) return;
    sim.stop = performance.now(); simPress(); sim.state = 'done'; sim.reason = r;
    sim.last.unshift({ t: Math.round((sim.stop - sim.start) / 100) / 10, r: r }); sim.last = sim.last.slice(0, 5);
  }
  function simCall(path, body) {
    const u = new URL(path, 'http://esp'), q = u.searchParams;
    const p = u.pathname.replace(/^\/api/, '');
    if (sim.state === 'brewing' && (p === '/brews/delete' || (p === '/brews' && !body))) throw new Error('HTTP 503');
    if (p === '/brews') { if (body) { sim.brews.push(JSON.parse(body)); return { ok: true }; } return sim.brews.slice(); }
    if (p === '/brews/delete') { sim.brews = sim.brews.filter((b) => String(b.id) !== q.get('id')); return { ok: true }; }
    if (p === '/coffees') { if (body) { sim.coffees = JSON.parse(body); return { ok: true }; } return sim.coffees.slice(); }
    if (p === '/start' && sim.state !== 'brewing' && simCanPress()) { sim.start = performance.now(); simPress(); sim.state = 'brewing'; sim.reason = ''; }
    else if (p === '/stop') simStop('manual');
    else if (p === '/set') { if (q.has('limit')) sim.limit = clamp(+q.get('limit')); if (q.has('auto')) sim.auto = q.get('auto') === '1'; }
    else if (p === '/press') { if (sim.state !== 'brewing' && simCanPress()) simPress(); }
    else if (p === '/reset') { if (sim.state !== 'brewing' || q.get('confirm') === '1') { sim.state = 'idle'; sim.reason = ''; } }
    if (sim.state === 'brewing') { const e = simElapsed() / 1000; if (sim.auto && e >= sim.limit) simStop('limit'); else if (e >= MAX_S) simStop('safety'); }
    return { state: sim.state, elapsed: Math.round(simElapsed()), limit: sim.limit, auto: sim.auto, reason: sim.reason, last: sim.last.slice(), presses: sim.presses, storage: true };
  }

  // ---------- talking to the ESP32 ----------
  async function request(path, body) {
    if (SIM) return JSON.parse(JSON.stringify(simCall(path, body)));
    const r = await fetch(path, body != null ? { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' } } : { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  async function api(path, isAction) {
    const wasBrewing = S.state === 'brewing';
    try { S = await request(path, isAction ? ' ' : undefined); statusAt = performance.now(); online = true; } catch (e) { online = false; }
    render();
    if (wasBrewing && S.state !== 'brewing') loadData();   // the ESP32 refuses journal reads during a shot
  }
  const action = (path) => api(path, true);
  async function poll() { if (busy) return; busy = true; try { await api('/api/status'); } finally { busy = false; } }

  async function loadData() {
    // A failed read keeps what we have. Treating it as "empty" would let the next save wipe the real list.
    try { const r = await request('/api/brews'); if (Array.isArray(r)) { brews = r; brewsLoaded = true; } } catch (e) {}
    try { const r = await request('/api/coffees'); if (Array.isArray(r)) { coffees = r; coffeesLoaded = true; } } catch (e) {}
    brews.sort((a, b) => b.ts - a.ts);
    renderLog(); renderBeans(); renderWeekLine();
  }
  // POST replaces the whole list, so never send one that didn't start from the ESP32's copy
  async function saveCoffees() {
    if (!coffeesLoaded) throw new Error('coffees not loaded');
    await request('/api/coffees', JSON.stringify(coffees));
  }

  // ---------- timer view ----------
  const dotsEl = $('dots');
  for (let i = 0; i < NDOTS; i++) dotsEl.appendChild(document.createElement('i'));
  const dotEls = dotsEl.children;
  function shownElapsed() { return (S.elapsed + (S.state === 'brewing' ? performance.now() - statusAt : 0)) / 1000; }

  function render() {
    const brewing = S.state === 'brewing';
    $('main').textContent = brewing ? 'stop.' : 'start.';
    $('main').className = 'main ' + (brewing ? 'stop' : 'go');
    $('state').className = 'state ' + S.state;
    $('stateText').textContent = brewing ? 'extracting.' : S.state === 'done' ? 'stopped ' + (REASON[S.reason] || '') + '.' : 'ready.';
    $('target').textContent = S.auto ? 'stop at ' + S.limit + ' s.' : 'no limit.';
    if (document.activeElement !== $('auto')) $('auto').checked = S.auto;
    $('limit').textContent = S.limit;
    $('stepper').classList.toggle('dim', !S.auto);
    $('press').disabled = brewing;
    $('storageBanner').hidden = S.storage !== false;
    document.querySelectorAll('#presets .chip').forEach((c) => c.classList.toggle('on', +c.dataset.v === S.limit));

    const rec = $('recent'); rec.innerHTML = '';
    (S.last || []).forEach((s) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="num">' + Number(s.t).toFixed(1) + ' s</span><span class="muted">' + esc(REASON[s.r] || '') + '</span>';
      rec.appendChild(li);
    });
    $('recentEmpty').hidden = (S.last || []).length > 0;

    const canSave = S.state === 'done' && S.last && S.last.length > 0 && savedKey !== S.presses;
    $('saveCard').hidden = !canSave;
    if (canSave) $('saveTime').textContent = Number(S.last[0].t).toFixed(1);

    $('conn').classList.toggle('off', !online);
    $('connText').textContent = SIM ? 'simulated.' : online ? 'connected.' : 'offline.';

    if (prevPresses !== null && S.presses !== prevPresses) { $('relay').classList.add('on'); setTimeout(() => $('relay').classList.remove('on'), 500); }
    prevPresses = S.presses;
  }
  function renderWeekLine() {
    const wk = coffees.filter((c) => c.week);
    $('weekLine').hidden = wk.length === 0;
    $('weekLine').innerHTML = 'this week: ' + wk.map((c) => '<b>' + esc(c.name) + '</b>').join(', ');
  }

  function frame() {
    const e = shownElapsed();
    $('sec').textContent = e.toFixed(1);
    const scale = S.auto ? S.limit : MAX_S;
    const n = Math.min(NDOTS, Math.round((e / scale) * NDOTS));
    for (let i = 0; i < NDOTS; i++) dotEls[i].classList.toggle('on', i < n);
    dotsEl.classList.toggle('end', S.state === 'done' && S.reason !== 'manual');
    requestAnimationFrame(frame);
  }

  $('main').addEventListener('click', () => action(S.state === 'brewing' ? '/api/stop' : '/api/start'));
  $('minus').addEventListener('click', () => action('/api/set?limit=' + clamp(S.limit - 1)));
  $('plus').addEventListener('click', () => action('/api/set?limit=' + clamp(S.limit + 1)));
  $('presets').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) action('/api/set?limit=' + clamp(+b.dataset.v)); });
  $('auto').addEventListener('change', (e) => action('/api/set?auto=' + (e.target.checked ? 1 : 0)));

  // First tap asks, second tap acts. The ESP32 can't see the machine, so the human has to vouch for its state.
  function twoTap(btn, question, needsAsking, run) {
    const label = btn.textContent;
    let timer = null;
    const disarm = () => { clearTimeout(timer); timer = null; btn.textContent = label; btn.classList.remove('red'); };
    btn.addEventListener('click', () => {
      if (timer) { disarm(); run(true); return; }
      if (!needsAsking()) { run(false); return; }
      btn.textContent = question; btn.classList.add('red');
      timer = setTimeout(disarm, 4000);
    });
  }
  twoTap($('press'), 'only if the machine is running. press?', () => true, () => action('/api/press'));
  twoTap($('reset'), 'only if the machine has stopped. reset?', () => S.state === 'brewing', (asked) => action(asked ? '/api/reset?confirm=1' : '/api/reset'));

  // ---------- tabs ----------
  const VIEWS = { timer: ['viewTimer', 'tabTimer'], log: ['viewLog', 'tabLog'], beans: ['viewBeans', 'tabBeans'] };
  function show(view) {
    Object.keys(VIEWS).forEach((k) => { $(VIEWS[k][0]).hidden = k !== view; $(VIEWS[k][1]).setAttribute('aria-selected', String(k === view)); });
    if (view !== 'timer') loadData();
  }
  $('tabTimer').addEventListener('click', () => show('timer'));
  $('tabLog').addEventListener('click', () => show('log'));
  $('tabBeans').addEventListener('click', () => show('beans'));

  // ---------- brew form ----------
  const form = { s: {}, notes: new Set(), fromShot: false };
  const scalesEl = $('scales');
  SCALES.forEach((sc) => {
    const wrap = document.createElement('div');
    wrap.className = 'scale';
    let dots = '';
    for (let v = 1; v <= 5; v++) dots += '<button type="button" class="sd" data-k="' + sc.k + '" data-v="' + v + '" aria-label="' + sc.name + ' ' + v + ' of 5"></button>';
    wrap.innerHTML = '<div class="scale-row"><span class="lbl">' + sc.name + '</span><div class="scale-dots" role="group" aria-label="' + sc.name + '">' + dots + '</div></div>' +
      '<div class="scale-ends"><span>' + sc.lo + '</span><span>' + sc.hi + '</span></div>';
    scalesEl.appendChild(wrap);
  });
  scalesEl.addEventListener('click', (e) => {
    const b = e.target.closest('.sd'); if (!b) return;
    const k = b.dataset.k, v = +b.dataset.v;
    form.s[k] = form.s[k] === v ? 0 : v;
    paintScales(); advise();
  });
  function paintScales() { scalesEl.querySelectorAll('.sd').forEach((b) => b.classList.toggle('on', +b.dataset.v <= (form.s[b.dataset.k] || 0))); }

  const notesEl = $('notes');
  NOTES.forEach((n) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = n; b.dataset.n = n; notesEl.appendChild(b); });
  notesEl.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    const n = b.dataset.n; form.notes.has(n) ? form.notes.delete(n) : form.notes.add(n);
    b.classList.toggle('on', form.notes.has(n));
  });

  // coffee picker: this week's bags as chips, a text field for anything else, and a dropdown of older bags
  function paintWeekChips() {
    const wk = coffees.filter((c) => c.week);
    $('fWeek').innerHTML = wk.map((c) => '<button type="button" class="chip' + (same(c.name, $('fCoffee').value) ? ' on' : '') + '" data-name="' + esc(c.name) + '">' + esc(c.name) + '</button>').join('');
    $('fWeek').hidden = wk.length === 0;
  }
  $('fWeek').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    $('fCoffee').value = b.dataset.name; $('fOld').hidden = true; paintWeekChips();
  });
  $('fCoffee').addEventListener('input', paintWeekChips);
  $('fOldBtn').addEventListener('click', () => {
    const old = coffees.filter((c) => !c.week).sort((a, b) => a.name.localeCompare(b.name));
    if (!old.length) { toast('No older coffees yet.'); return; }
    $('fOld').innerHTML = '<option value="">pick an older coffee…</option>' + old.map((c) => '<option value="' + esc(c.name) + '">' + esc(c.name) + (c.roaster ? ' · ' + esc(c.roaster) : '') + '</option>').join('');
    $('fOld').hidden = !$('fOld').hidden;
  });
  $('fOld').addEventListener('change', (e) => { if (e.target.value) { $('fCoffee').value = e.target.value; paintWeekChips(); } });

  function ratio() {
    const d = parseFloat($('fDose').value), y = parseFloat($('fYield').value);
    $('fRatio').textContent = d > 0 && y > 0 ? '1:' + (y / d).toFixed(1) : '–';
  }
  ['fDose', 'fYield'].forEach((id) => $(id).addEventListener('input', ratio));

  function advise() {
    const a = form.s.acid || 0, b = form.s.bitter || 0, body = form.s.body || 0;
    let msg = '';
    if (a >= 4 && b <= 2) msg = 'Sour with little bitterness usually means under-extraction. Try a finer grind or a slightly longer shot.';
    else if (b >= 4 && a <= 2) msg = 'Strong bitterness usually means over-extraction. Try a coarser grind or a shorter shot.';
    else if (body && body <= 2 && a >= 3) msg = 'Light body with high acidity: try a slightly shorter ratio, e.g. 1:1.8.';
    $('advice').textContent = msg; $('advice').hidden = !msg;
  }

  function remembered() { try { return JSON.parse(localStorage.getItem('gaggia-last') || '{}'); } catch (e) { return {}; } }
  function remember(o) { try { localStorage.setItem('gaggia-last', JSON.stringify(o)); } catch (e) {} }

  function openForm(time) {
    const last = remembered(), wk = coffees.filter((c) => c.week);
    let coffee = last.coffee || '';
    if (wk.length === 1) coffee = wk[0].name;
    else if (wk.length > 1 && !wk.some((c) => same(c.name, coffee))) coffee = '';
    $('fCoffee').value = coffee;
    $('fGrind').value = last.grind || '';
    $('fDose').value = last.dose || '';
    $('fYield').value = '';
    $('fTime').value = time != null ? Number(time).toFixed(1) : '';
    $('fComment').value = '';
    $('fOld').hidden = true;
    form.s = {}; form.notes = new Set(); form.fromShot = time != null;
    notesEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
    paintScales(); advise(); ratio(); paintWeekChips();
    $('sheet').hidden = false;
  }
  function closeForm() { $('sheet').hidden = true; }
  $('saveOpen').addEventListener('click', () => openForm(S.last[0].t));
  $('newEntry').addEventListener('click', () => openForm(null));
  $('cancel').addEventListener('click', closeForm);
  $('closeX').addEventListener('click', closeForm);
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeForm(); });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const num = (id) => { const v = parseFloat($(id).value); return isFinite(v) ? v : null; };
    const now = Date.now();
    const brew = {
      id: now, ts: now,
      coffee: $('fCoffee').value.trim(), grind: $('fGrind').value.trim(),
      dose: num('fDose'), yield: num('fYield'), time: num('fTime'),
      s: Object.assign({}, form.s), notes: Array.from(form.notes), comment: $('fComment').value.trim(),
    };
    try {
      await request('/api/brews', JSON.stringify(brew));
      if (coffeesLoaded && brew.coffee && !coffees.some((c) => same(c.name, brew.coffee))) {
        coffees.push({ id: now, name: brew.coffee, roaster: '', roasted: '', week: false });
        await saveCoffees();
      }
      remember({ coffee: brew.coffee, grind: brew.grind, dose: brew.dose });
      if (form.fromShot) savedKey = S.presses;
      closeForm(); render(); toast('saved.');
      loadData();
    } catch (err) {
      toast('Not saved. Check the connection to the ESP32 and try again.');
    }
  });

  // ---------- journal ----------
  function pips(v) { return v ? '●'.repeat(v) + '○'.repeat(5 - v) : '–'; }
  function fmtDate(ts) { try { return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function entryHTML(b) {
    const r = b.dose > 0 && b.yield > 0 ? '1:' + (b.yield / b.dose).toFixed(1) : null;
    const st = [];
    if (b.dose != null || b.yield != null) st.push('<span><b>' + (b.dose != null ? b.dose.toFixed(1) : '–') + '</b> → <b>' + (b.yield != null ? b.yield.toFixed(1) : '–') + '</b> g</span>');
    if (r) st.push('<span><b>' + r + '</b></span>');
    if (b.time != null) st.push('<span><b>' + b.time.toFixed(1) + '</b> s</span>');
    if (b.grind) st.push('<span>grind <b>' + esc(b.grind) + '</b></span>');
    const s = b.s || {};
    const mini = SCALES.filter((sc) => s[sc.k]).map((sc) => '<span>' + sc.name + '<span class="pips">' + pips(s[sc.k]) + '</span></span>').join('');
    const tags = (b.notes || []).map((n) => '<span class="tag">' + esc(n) + '</span>').join('');
    return '<div class="entry">' +
      '<div class="entry-top"><span class="entry-name">' + esc(b.coffee || 'unnamed') + (b.example ? ' <span class="example">example</span>' : '') + '</span><span class="entry-date">' + fmtDate(b.ts) + '</span></div>' +
      (st.length ? '<div class="stats">' + st.join('') + '</div>' : '') +
      (mini ? '<div class="mini">' + mini + '</div>' : '') +
      (tags ? '<div class="chips">' + tags + '</div>' : '') +
      (b.comment ? '<p class="comment">' + esc(b.comment) + '</p>' : '') +
      (pendingDelete === b.id
        ? '<div class="confirm">Delete for good? <button class="btn red small" type="button" data-del="' + b.id + '">delete.</button><button class="btn ghost small" type="button" data-keep="1">cancel.</button></div>'
        : '<button class="linkbtn" type="button" data-ask="' + b.id + '">delete</button>') +
      '</div>';
  }

  let mode = 'list';
  const today = new Date();
  const dayKey = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  let calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let selDay = dayKey(today);

  function renderLog() {
    $('listWrap').hidden = mode !== 'list';
    $('calWrap').hidden = mode !== 'cal';
    $('modeList').setAttribute('aria-pressed', String(mode === 'list'));
    $('modeCal').setAttribute('aria-pressed', String(mode === 'cal'));
    if (mode === 'list') {
      $('log').innerHTML = brews.map(entryHTML).join('');
      $('logEmpty').hidden = brews.length > 0;
    } else renderCal();
  }
  function renderCal() {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    $('calTitle').textContent = calMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toLowerCase() + '.';
    const byDay = {};
    brews.forEach((b) => { const k = dayKey(new Date(b.ts)); (byDay[k] = byDay[k] || []).push(b); });
    const offset = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    let html = ['m', 't', 'w', 't', 'f', 's', 's'].map((d) => '<span class="wd">' + d + '</span>').join('');
    for (let i = 0; i < offset; i++) html += '<span class="cd empty"></span>';
    const tk = dayKey(today);
    for (let d = 1; d <= days; d++) {
      const k = y + '-' + (m + 1) + '-' + d, n = (byDay[k] || []).length;
      const cls = 'cd' + (n ? ' has' : '') + (k === tk ? ' today' : '') + (k === selDay ? ' sel' : '');
      html += '<button type="button" class="' + cls + '" data-day="' + k + '" aria-label="' + d + ', ' + n + ' shots"><span>' + d + '</span><span class="cdots">' + '<i></i>'.repeat(Math.min(n, 3)) + '</span></button>';
    }
    $('calGrid').innerHTML = html;
    const parts = selDay.split('-').map(Number);
    $('dayTitle').textContent = new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toLowerCase() + '.';
    const list = byDay[selDay] || [];
    $('dayList').innerHTML = list.map(entryHTML).join('');
    $('dayEmpty').hidden = list.length > 0;
  }
  $('modeList').addEventListener('click', () => { mode = 'list'; renderLog(); });
  $('modeCal').addEventListener('click', () => { mode = 'cal'; renderLog(); });
  $('calPrev').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCal(); });
  $('calNext').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCal(); });
  $('calGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (b) { selDay = b.dataset.day; renderCal(); } });

  $('viewLog').addEventListener('click', async (e) => {
    const ask = e.target.closest('[data-ask]'), del = e.target.closest('[data-del]'), keep = e.target.closest('[data-keep]');
    if (ask) { pendingDelete = +ask.dataset.ask; renderLog(); }
    else if (keep) { pendingDelete = null; renderLog(); }
    else if (del) {
      try { await request('/api/brews/delete?id=' + del.dataset.del, ' '); pendingDelete = null; toast('deleted.'); loadData(); }
      catch (err) { toast('Not deleted. Check the connection.'); }
    }
  });

  // backup and restore
  if (SIM) { $('backupLink').hidden = true; $('backupSimNote').hidden = false; }
  $('restoreFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    // Needs the current lists to skip duplicates and to merge coffees rather than replace them
    if (!brewsLoaded || !coffeesLoaded) { toast('Not restored. Check the connection and try again.'); return; }
    try {
      const data = JSON.parse(await file.text());
      const inBrews = Array.isArray(data.brews) ? data.brews : [], inCoffees = Array.isArray(data.coffees) ? data.coffees : [];
      const have = new Set(brews.map((b) => String(b.id)));
      let added = 0;
      for (const b of inBrews) {
        if (!b || b.id == null || have.has(String(b.id))) continue;
        const clean = Object.assign({ id: b.id }, b);
        await request('/api/brews', JSON.stringify(clean)); added++;
      }
      inCoffees.forEach((c) => { if (c && c.name && !coffees.some((x) => same(x.name, c.name))) coffees.push(c); });
      await saveCoffees();
      toast('Restored ' + added + ' shots.');
      loadData();
    } catch (err) {
      toast('That file could not be read. Pick a gaggia-backup.json file.');
    }
  });

  // ---------- coffees ----------
  function daysOff(roasted) {
    if (!roasted) return null;
    const p = roasted.split('-').map(Number);
    const d = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(p[0], p[1] - 1, p[2])) / DAY);
    return isFinite(d) ? d : null;
  }
  function beanHTML(c) {
    const shots = brews.filter((b) => same(b.coffee, c.name));
    const d = daysOff(c.roasted);
    const meta = [];
    if (c.roaster) meta.push('<span>' + esc(c.roaster) + '</span>');
    if (d != null) meta.push('<span><b>' + d + '</b> days off roast</span>');
    meta.push('<span><b>' + shots.length + '</b> ' + (shots.length === 1 ? 'shot' : 'shots') + '</span>');
    const rated = shots.filter((b) => b.s && b.s.overall);
    if (rated.length) meta.push('<span>avg <b>' + (rated.reduce((a, b) => a + b.s.overall, 0) / rated.length).toFixed(1) + '</b>/5</span>');
    const last = shots.find((b) => b.grind);
    if (last) meta.push('<span>last grind <b>' + esc(last.grind) + '</b></span>');
    return '<div class="bean">' +
      '<div class="bean-top"><span class="bean-name">' + esc(c.name) + (c.example ? ' <span class="example">example</span>' : '') + '</span>' +
      '<button type="button" class="star' + (c.week ? ' on' : '') + '" data-week="' + c.id + '">' + (c.week ? 'this week ✓' : 'this week') + '</button></div>' +
      '<div class="bean-meta">' + meta.join('') + '</div>' +
      (pendingBean === c.id
        ? '<div class="confirm">Remove this coffee? Its shots stay in the journal. <button class="btn red small" type="button" data-bdel="' + c.id + '">remove.</button><button class="btn ghost small" type="button" data-bkeep="1">cancel.</button></div>'
        : '<button class="linkbtn" type="button" data-bask="' + c.id + '">remove</button>') +
      '</div>';
  }
  function renderBeans() {
    const wk = coffees.filter((c) => c.week), lib = coffees.filter((c) => !c.week).sort((a, b) => a.name.localeCompare(b.name));
    $('weekList').innerHTML = wk.map(beanHTML).join('');
    $('weekEmpty').hidden = wk.length > 0;
    $('libList').innerHTML = lib.map(beanHTML).join('');
    $('libEmpty').hidden = lib.length > 0;
  }
  $('viewBeans').addEventListener('click', async (e) => {
    const wkB = e.target.closest('[data-week]'), ask = e.target.closest('[data-bask]'), del = e.target.closest('[data-bdel]'), keep = e.target.closest('[data-bkeep]');
    try {
      if (wkB) { const c = coffees.find((x) => String(x.id) === wkB.dataset.week); if (c) { c.week = !c.week; await saveCoffees(); } }
      else if (ask) { pendingBean = +ask.dataset.bask; }
      else if (keep) { pendingBean = null; }
      else if (del) { coffees = coffees.filter((x) => String(x.id) !== del.dataset.bdel); pendingBean = null; await saveCoffees(); toast('removed.'); }
      else return;
    } catch (err) { toast('Not saved. Check the connection.'); }
    renderBeans(); renderWeekLine();
  });
  $('addBean').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('bName').value.trim(); if (!name) return;
    const existing = coffees.find((c) => same(c.name, name));
    if (existing) {
      existing.roaster = $('bRoaster').value.trim() || existing.roaster;
      existing.roasted = $('bRoasted').value || existing.roasted;
      existing.week = $('bWeek').checked;
    } else {
      coffees.push({ id: Date.now(), name: name, roaster: $('bRoaster').value.trim(), roasted: $('bRoasted').value, week: $('bWeek').checked });
    }
    try { await saveCoffees(); toast('added.'); $('bName').value = ''; $('bRoaster').value = ''; $('bRoasted').value = ''; }
    catch (err) { toast('Not saved. Check the connection.'); }
    renderBeans(); renderWeekLine();
  });

  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

  // ---------- start ----------
  $('simBanner').hidden = !SIM;
  render(); poll(); loadData();
  setInterval(poll, SIM ? 100 : 300);
  requestAnimationFrame(frame);
})();
