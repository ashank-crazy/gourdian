import { renderPumpkin, drawFavicon } from './pumpkin.js';
import { sfx, setMuted, unlock } from './sound.js';
import { LINES, CULPRITS, CAUSES, GRADES, STAGES, EPITAPHS, FRESHNESS, pick, fill } from './lines.js';
import { analyze, fitHazard, periods, usable, survival, recommend, riskAhead, starterModel, sessionTable, toCSV, NUDGE, FEATURES } from './insights.js';
import { survivalChart, bindSurvival, hoursChart, effectsChart, calibrationChart, makeTip, bindTips } from './charts.js';
import { sampleSessions } from './simulate.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');          // ?demo speeds rot up for recording a video
const GRACE_MS = DEMO ? 3000 : 10000;     // short peeks are free
const ROT_PER_SEC = DEMO ? 1 : 0.2;       // rot (in %) per second away, after the grace period
const HEAL_PER_SEC = 1 / 60;              // rot healed per second of watched focus
const DECAY_PER_DAY = 8;                  // rot per full day without a finished session
const ABANDON_ROT = 15;
const WORK_PASSES = 2;                    // "working, I swear" is fully excused this many times per session
const KEY = 'gourdian:v1';

const $ = s => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const now = () => Date.now();

// ---------- state ----------

const roman = n => {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
};
const defaultName = gen => (gen === 1 ? 'Jack' : `Jack ${roman(gen)}`);

function newPumpkin(gen, name = '') {
  return { gen, name: name.trim() || defaultName(gen), born: now(), rot: 0, focusSec: 0, sessions: 0, culprits: {}, decayDays: 0, dead: false };
}

function freshState() {
  return {
    v: 1,
    pumpkin: newPumpkin(1),
    graveyard: [],
    culprits: {},
    sessions: [],
    totals: { focusSec: 0, sessions: 0, trips: 0, workClaims: 0 },
    session: null,
    settings: { muted: false, notify: false, minutes: 25, lastTask: '', experiment: true },
    lastActiveAt: now(),
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.v === 1 && saved.pumpkin) {
      const base = freshState();
      return { ...base, ...saved, settings: { ...base.settings, ...saved.settings }, totals: { ...base.totals, ...saved.totals } };
    }
  } catch { /* private mode or corrupt data: start fresh */ }
  return freshState();
}

let state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } };

// ---------- formatting ----------

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtClock = sec => {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
const fmtDur = sec => {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return s && m < 10 ? `${m}m ${s}s` : `${m}m`;
};
const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtLife = (from, to) => {
  const d = Math.floor((to - from) / 86400000);
  return d < 1 ? 'less than a day' : d === 1 ? '1 day' : `${d} days`;
};
const fmtAge = ts => {
  const d = Math.floor((now() - ts) / 86400000);
  return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

const stageIndex = sec => STAGES.reduce((idx, st, i) => (sec >= st.min * 60 ? i : idx), 0);
const elapsedSec = s => ((s.pausedAt ?? now()) - s.startedAt - s.pausedMs) / 1000;
const remainingSec = s => s.plannedSec - elapsedSec(s);
const sessionEnd = s => s.startedAt + s.pausedMs + s.plannedSec * 1000;
const awayRot = ms => Math.max(0, (ms - GRACE_MS) / 1000) * ROT_PER_SEC;
const say_ = (str, vars = {}) => fill(str, { name: state.pumpkin.name, ...vars });

// ---------- Jack ----------

const jackEl = $('#jack');
let mood = 'happy', moodTimer = null, lastKey = '', lastRot = null, faceX = 0, faceY = 0;

function baseMood() {
  const s = state.session;
  if (state.pumpkin.dead) return 'dead';
  if (s?.pendingTrip) return 'horrified';
  if (s?.mode === 'break') return 'sleeping';
  if (s?.mode === 'focus' && !s.pausedAt) return 'focused';
  return 'happy';
}

function setMood(m, holdMs = 0) {
  clearTimeout(moodTimer);
  mood = m;
  renderJack();
  if (holdMs) moodTimer = setTimeout(() => { mood = baseMood(); renderJack(); }, holdMs);
}

function displayRot() {
  const trip = state.session?.pendingTrip;
  return Math.min(100, state.pumpkin.rot + (trip ? trip.pending : 0));
}

function renderJack(force = false) {
  const rot = displayRot();
  const stage = stageIndex(state.pumpkin.focusSec);
  const key = `${Math.floor(rot)}|${mood}|${stage}`;
  if (force || key !== lastKey) {
    jackEl.innerHTML = renderPumpkin({ rot, mood, stage, newSpotsFrom: lastRot });
    lastKey = key;
    lastRot = rot;
    applyFace();
  }
  renderVitals(rot, stage);
}

function renderVitals(rot, stage) {
  const p = state.pumpkin;
  const fresh = Math.max(0, Math.round(100 - rot));
  const k = 1 - fresh / 100;
  $('#p-name').textContent = p.name;
  $('#p-stage').textContent = STAGES[stage].name;
  $('#fresh-label').textContent = `${FRESHNESS.find(f => fresh >= f.min).label} · ${fresh}% fresh`;
  const bar = $('#fresh-fill');
  bar.style.width = `${fresh}%`;
  bar.style.background = `hsl(${28 + k * 34} ${88 - k * 48}% ${58 - k * 18}%)`;
  $('#fresh-meter').setAttribute('aria-valuenow', fresh);
  const next = STAGES[stage + 1];
  $('#p-next').textContent = p.dead
    ? `${fmtDur(p.focusSec)} of focus, gone`
    : next ? `${fmtDur(next.min * 60 - p.focusSec)} to ${next.name}` : 'Final form reached';
  jackEl.style.setProperty('--fresh', (fresh / 100).toFixed(2));
}

function applyFace() {
  const g = jackEl.querySelector('[data-face]');
  if (g) g.style.transform = `translate(${faceX.toFixed(1)}px, ${faceY.toFixed(1)}px)`;
}

// The carved face drifts toward the cursor: Jack is always watching.
window.addEventListener('pointermove', e => {
  if (reduceMotion || mood === 'dead' || mood === 'sleeping') return;
  const b = jackEl.getBoundingClientRect();
  const dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height * 0.6);
  const d = Math.hypot(dx, dy) || 1, pull = Math.min(1, d / 420);
  faceX = (dx / d) * 10 * pull;
  faceY = (dy / d) * 7 * pull;
  requestAnimationFrame(applyFace);
}, { passive: true });

let typeTimer = null;
function say(text, m = null, hold = 6500) {
  text = say_(text);
  $('#bubble-sr').textContent = text;
  $('#bubble-ghost').textContent = text;
  const typed = $('#bubble-text');
  const bubble = $('#bubble');
  clearInterval(typeTimer);
  bubble.classList.remove('pop');
  void bubble.offsetWidth;
  bubble.classList.add('pop');
  if (reduceMotion || document.hidden) typed.textContent = text;
  else {
    let i = 0;
    typed.textContent = '';
    typeTimer = setInterval(() => {
      i += 2;
      typed.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typeTimer);
    }, 22);
  }
  if (m) setMood(m, hold);
}

jackEl.addEventListener('click', () => {
  unlock();
  sfx.poke();
  jackEl.classList.remove('squish');
  void jackEl.offsetWidth;
  jackEl.classList.add('squish');
  const dead = state.pumpkin.dead, sleeping = state.session?.mode === 'break';
  say(pick(dead ? LINES.pokeDead : sleeping ? LINES.pokeSleep : LINES.poke), dead || sleeping ? null : 'suspicious', 2500);
});

// ---------- tab title + favicon ----------

const favCanvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
let favKey = '', favURL = '';

function liveRot() {
  const s = state.session;
  let rot = displayRot();
  if (s?.awayStart && document.hidden) rot += awayRot(Math.min(now(), sessionEnd(s)) - s.awayStart);
  return Math.min(100, rot);
}

function updateFavicon() {
  const s = state.session;
  const rot = liveRot();
  const progress = s?.mode === 'focus' ? Math.min(1, elapsedSec(s) / s.plannedSec) : null;
  const key = `${Math.floor(rot / 2)}|${progress == null ? '-' : Math.floor(progress * 48)}`;
  if (key === favKey) return;
  favKey = key;
  drawFavicon(favCanvas, rot, progress);
  favURL = favCanvas.toDataURL('image/png');
  $('#favicon').href = favURL;
}

function guiltTitle(ms) {
  let line = LINES.titles[0][1];
  for (const [at, l] of LINES.titles) if (ms / 1000 >= at) line = l;
  return line;
}

function updateTitle() {
  const s = state.session, p = state.pumpkin;
  let t;
  if (p.dead) t = `⚰️ RIP ${p.name} · Gourdian`;
  else if (!s) t = `Gourdian · don't let ${p.name} rot`;
  else if (s.mode === 'break') t = `☕ ${fmtClock(remainingSec(s))} break · Gourdian`;
  else if (document.hidden && s.awayStart) t = s.timeUp ? "⏰ time's up! come back & confess" : guiltTitle(now() - s.awayStart);
  else if (s.pendingTrip) t = '🎃 Confession time · Gourdian';
  else if (s.pausedAt) t = `⏸ ${fmtClock(remainingSec(s))} paused · Gourdian`;
  else t = `${fmtClock(remainingSec(s))} · ${s.task || 'Focusing'} · Gourdian`;
  if (document.title !== t) document.title = t;
}

// ---------- notifications ----------

function notify(title, body) {
  if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: favURL || undefined, tag: 'gourdian' }); } catch { /* e.g. Android needs a service worker */ }
}

// ---------- sessions ----------

function startSession(task, minutes) {
  state.settings.lastTask = task;
  state.session = {
    mode: 'focus', task, plannedSec: Math.max(5, Math.round(minutes * 60)),
    startedAt: now(), pausedAt: null, pausedMs: 0,
    trips: 0, unexcusedSec: 0, excusedSec: 0, workClaims: 0, culprits: {},
    awayStart: null, pendingTrip: null, timeUp: false, lastBeat: now(),
    away: [], peeks: 0, nudges: [], lastDecision: null,
  };
  state.lastActiveAt = now();
  nextChat = now() + 30000;
  updateRisk(true);
  sfx.start();
  save();
  mood = 'focused';
  renderPanel();
  say(pick(LINES.start), 'focused');
  updateTitle();
}

function logSession(s, extra = {}) {
  const top = Object.entries(s.culprits).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const entry = {
    task: s.task, at: now(), startedAt: s.startedAt, plannedSec: s.plannedSec, elapsedSec: Math.round(Math.min(s.plannedSec, elapsedSec(s))),
    unexcusedSec: Math.round(s.unexcusedSec), trips: s.trips, top, grade: '—',
    away: s.away, peeks: s.peeks, nudges: s.nudges, ...extra,
  };
  state.sessions.unshift(entry);
  state.sessions.length = Math.min(state.sessions.length, 500);
  refreshModel();
  return entry;
}

function finishSession() {
  const s = state.session, p = state.pumpkin;
  const ratio = Math.max(0, 1 - s.unexcusedSec / s.plannedSec);
  const grade = GRADES.find(g => ratio >= g.min && (g.letter !== 'A+' || s.unexcusedSec === 0));
  const focused = Math.round(Math.max(0, s.plannedSec - s.unexcusedSec));
  const before = stageIndex(p.focusSec);
  p.rot = Math.max(0, p.rot - Math.min(20, (s.plannedSec / 60) * 0.4));
  p.focusSec += focused;
  p.sessions++;
  p.decayDays = 0;
  state.totals.focusSec += focused;
  state.totals.sessions++;
  const after = stageIndex(p.focusSec);
  const entry = logSession(s, { grade: grade.letter, focusedSec: focused });
  state.session = null;
  state.lastActiveAt = now();
  save();
  sfx.chime();
  clearTimeout(moodTimer);
  mood = 'celebrate';
  renderJack(true);
  renderPanel();
  updateTitle();
  updateFavicon();
  const line = say_(pick(LINES.complete));
  say(line, 'celebrate', 9000);
  openReport({ entry, grade, line, stagedUp: after > before ? STAGES[after].name : null });
}

function abandon() {
  const s = state.session;
  if (!s) return;
  logSession(s, { abandoned: true });
  state.session = null;
  state.pumpkin.rot = Math.min(100, state.pumpkin.rot + ABANDON_ROT);
  if (state.pumpkin.rot >= 100) return die('abandonment');
  save();
  mood = baseMood();
  renderPanel();
  say(pick(LINES.abandon), 'sad');
  updateTitle();
}

function startBreak() {
  state.session = { mode: 'break', plannedSec: DEMO ? 20 : 300, startedAt: now(), pausedAt: null, pausedMs: 0 };
  save();
  mood = 'sleeping';
  renderPanel();
  say(pick(LINES.breakStart), 'sleeping');
  updateTitle();
}

function endBreak(skipped = false) {
  state.session = null;
  save();
  if (!skipped) {
    sfx.chime();
    notify("Break's over ☕", say_('{name} is awake and judging.'));
  }
  mood = 'happy';
  renderPanel();
  say(pick(LINES.breakEnd), 'happy');
  updateTitle();
  $('#task').value = state.settings.lastTask || '';
}

// ---------- leaving and coming back ----------

document.addEventListener('visibilitychange', () => {
  const s = state.session;
  if (document.hidden) {
    if (s?.mode === 'focus' && !s.pausedAt && !s.awayStart && !s.timeUp) {
      s.awayStart = now();
      s.awayAtSec = elapsedSec(s);
      s.nagged = false;
      save();
    }
  } else {
    lastTick = now();
    onReturn();
  }
  updateTitle();
  updateFavicon();
});

function onReturn() {
  const s = state.session;
  if (!s || s.mode !== 'focus' || !s.awayStart) { renderJack(); renderPanel(); return; }
  const ms = Math.max(0, Math.min(now(), sessionEnd(s)) - s.awayStart);
  s.awayStart = null;
  if (ms < GRACE_MS && !s.pendingTrip) {
    if (ms > 2500) say(pick(LINES.peek), 'suspicious', 3500);
    s.peeks = (s.peeks || 0) + 1;
    save();
    return;
  }
  // Leaving again before confessing extends the same trip, so it keeps its original start time.
  const prev = s.pendingTrip || { ms: 0, pending: 0, atSec: s.awayAtSec };
  s.pendingTrip = { ms: prev.ms + ms, pending: Math.min(100, prev.pending + awayRot(ms)), atSec: prev.atSec };
  save();
  sfx.uhoh();
  openConfession();
}

function openConfession() {
  const s = state.session, trip = s.pendingTrip;
  const sec = trip.ms / 1000;
  clearTimeout(moodTimer);
  mood = 'horrified';
  renderJack();
  renderPanel();
  $('#conf-time').textContent = fmtDur(sec);
  $('#conf-dmg').textContent = `+${Math.round(trip.pending)}% rot`;
  $('#conf-fatal').hidden = state.pumpkin.rot + trip.pending < 100;
  const passes = WORK_PASSES - s.workClaims;
  $('#work-sub').textContent = passes > 0 ? `undoes the rot · ${passes} left this session` : `${state.pumpkin.name} is squinting · half credit`;
  const bank = sec < 120 ? LINES.returnShort : sec < 600 ? LINES.returnMed : LINES.returnLong;
  say(pick(bank).replace('{t}', fmtDur(sec)));
  // On narrow screens the card sits below Jack: scroll so both the moldy face and the buttons show.
  if (innerWidth < 860) scrollTo({ top: scrollY + $('#card-confess').getBoundingClientRect().top - innerHeight * 0.3, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function confess(key) {
  const s = state.session;
  if (!s?.pendingTrip) return;
  unlock();
  const { ms, pending, atSec } = s.pendingTrip;
  const sec = Math.round(ms / 1000);
  s.pendingTrip = null;
  s.trips++;
  if (s.away && atSec != null) s.away.push({ t: Math.round(atSec), d: sec, c: key });
  state.totals.trips++;
  let added = pending, line;
  if (key === 'work') {
    s.workClaims++;
    state.totals.workClaims++;
    if (s.workClaims <= WORK_PASSES) {
      added = 0;
      s.excusedSec += sec;
      line = pick(LINES.confess.work);
      sfx.pass();
    } else {
      added = pending / 2;
      s.excusedSec += sec / 2;
      s.unexcusedSec += sec / 2;
      line = pick(LINES.workSus).replace('{n}', s.workClaims);
    }
  } else {
    s.unexcusedSec += sec;
    line = pick(LINES.confess[key]);
    for (const book of [s.culprits, state.pumpkin.culprits, state.culprits]) book[key] = (book[key] || 0) + sec;
  }
  state.pumpkin.rot = Math.min(100, state.pumpkin.rot + added);
  if (state.pumpkin.rot >= 100) { save(); return die(key); }
  updateRisk(true);
  save();
  mood = baseMood();
  renderPanel();
  say(line, key === 'work' ? 'suspicious' : 'sad', 5000);
}

// ---------- death ----------

function die(causeKey) {
  const p = state.pumpkin, s = state.session;
  const top = Object.entries(p.culprits).sort((a, b) => b[1] - a[1])[0]?.[0];
  const cause = CAUSES[causeKey] ? causeKey : top || 'neglect';
  if (s?.mode === 'focus') logSession(s, { died: true, grade: '💀' });
  state.session = null;
  Object.assign(p, { rot: 100, dead: true, died: now(), cause });
  const grave = {
    name: p.name, gen: p.gen, born: p.born, died: p.died, focusSec: p.focusSec, sessions: p.sessions,
    stage: stageIndex(p.focusSec), cause, epitaph: say_(pick(EPITAPHS)),
  };
  state.graveyard.unshift(grave);
  save();
  clearTimeout(moodTimer);
  mood = 'dead';
  renderJack(true);
  renderPanel();
  updateTitle();
  updateFavicon();
  sfx.trombone();
  say(pick(LINES.death));
  setTimeout(() => openDeath(grave), reduceMotion ? 0 : 1400);
}

function applyDecay() {
  const p = state.pumpkin;
  if (p.dead || state.session) return 0;
  const days = Math.floor((now() - Math.max(state.lastActiveAt, p.born)) / 86400000);
  const owed = days - (p.decayDays || 0);
  if (owed <= 0) return 0;
  p.decayDays = days;
  p.rot = Math.min(100, p.rot + owed * DECAY_PER_DAY);
  save();
  return days;
}

// ---------- slip risk ----------

let model = starterModel(), rec = null, analysisCache = null;

function refreshModel() {
  const rows = usable(state.sessions).flatMap(periods);
  model = rows.length ? fitHazard(rows) : starterModel();
  rec = recommend(survival(state.sessions));
  analysisCache = null;
  renderChips();
}

// Once a minute while Jack is watching: re-score the next few minutes. At a high-risk moment Jack
// warns you with probability NUDGE.p (a micro-randomized trial), and both outcomes are logged so the
// Insights page can measure whether the warnings help.
function updateRisk(force = false) {
  const s = state.session;
  if (s?.mode !== 'focus') return;
  const minute = Math.floor(elapsedSec(s) / 60), fresh = s.riskMinute !== minute;
  if (!force && !fresh) return;
  s.riskMinute = minute;
  const slipped = (s.away || []).some(e => e.c !== 'work');
  s.risk = riskAhead(model, { minute, slipped, plannedMin: s.plannedSec / 60, at: now() }, NUDGE.horizonMin);
  // Decisions happen once per new minute, never mid-minute on a forced refresh (e.g. right after a confession).
  if (!fresh || !s.nudges || minute < 1 || remainingSec(s) < 60 || s.risk < NUDGE.risk) return;
  if (s.lastDecision != null && minute - s.lastDecision < NUDGE.cooldownMin) return;
  const sent = !state.settings.experiment || Math.random() < NUDGE.p;
  s.nudges.push({ m: minute, r: Math.round(s.risk * 1000) / 1000, sent });
  s.lastDecision = minute;
  if (!sent) return;
  nextChat = now() + 45000;
  say(pick(LINES.riskWarn).replace('{m}', minute), 'suspicious', 6000);
}

// ---------- the clock ----------

let lastTick = now(), lastSave = 0, nextChat = now() + 25000;

function chatter(s, t) {
  const el = elapsedSec(s), rem = s.plannedSec - el;
  if (!s.saidHalf && s.plannedSec >= 300 && el >= s.plannedSec / 2) { s.saidHalf = true; return say(pick(LINES.halfway), 'happy', 4000); }
  if (!s.saidLast && s.plannedSec >= 300 && rem <= 60 && rem > 0) { s.saidLast = true; return say(pick(LINES.lastMinute), 'suspicious', 4000); }
  if (t >= nextChat) {
    nextChat = t + 45000 + Math.random() * 30000;
    say(pick(LINES.focusing), Math.random() < 0.5 ? 'happy' : null, 4000);
  }
}

function tick() {
  const t = now(), dt = Math.min(5, (t - lastTick) / 1000);
  lastTick = t;
  const s = state.session;
  if (s && !s.pausedAt) {
    if (s.mode === 'focus') {
      const away = document.hidden;
      if (!away && !s.pendingTrip) {
        state.pumpkin.rot = Math.max(0, state.pumpkin.rot - HEAL_PER_SEC * dt);
        chatter(s, t);
        updateRisk();
      }
      if (away && s.awayStart && !s.nagged && t - s.awayStart > 60000 && !s.timeUp) {
        s.nagged = true;
        notify(say_('{name} is rotting 🎃'), say_(pick(LINES.nag)));
      }
      if (!s.timeUp && remainingSec(s) <= 0) {
        s.timeUp = true;
        if (away) {
          sfx.chime();
          notify("Time's up! ⏰", say_('Come back and tell {name} where you went.'));
        }
      }
      if (s.timeUp && !away && !s.pendingTrip) finishSession();
    } else if (remainingSec(s) <= 0) endBreak();
    if (state.session) state.session.lastBeat = t;
  } else if (!s && !state.pumpkin.dead && !document.hidden && t >= nextChat && !document.querySelector('dialog[open]')) {
    nextChat = t + 80000 + Math.random() * 40000;
    say(pick(LINES.idle));
  }
  if (!document.hidden) { renderJack(); renderLive(); }
  updateTitle();
  updateFavicon();
  if (t - lastSave > 4000) { save(); lastSave = t; }
}

function startTicker() {
  // A worker keeps ticking at 1s in background tabs, where page timers get throttled to once a minute.
  try {
    const src = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 1000)'], { type: 'text/javascript' }));
    new Worker(src).onmessage = tick;
  } catch {
    setInterval(tick, 1000);
  }
}

// ---------- panel ----------

function renderPanel() {
  const s = state.session, p = state.pumpkin;
  const which = p.dead ? 'dead' : !s ? 'setup' : s.mode === 'break' ? 'break' : s.pendingTrip ? 'confess' : 'run';
  for (const n of ['setup', 'run', 'confess', 'break', 'dead']) $(`#card-${n}`).hidden = n !== which;
  $('#card-how').hidden = which !== 'setup';
  if (which === 'run') {
    $('#run-task').textContent = s.task || 'Untitled grind';
    $('#btn-pause').textContent = s.pausedAt ? 'Resume' : 'Pause';
    $('#card-run').classList.toggle('is-paused', !!s.pausedAt);
    $('#run-status').textContent = s.pausedAt ? `Paused. ${p.name} is holding still.` : `${p.name} is watching this tab.`;
    $('#risk-note').textContent = model.n
      ? `Learned from ${fmtDur(model.n * 60)} of your focus`
      : 'Starter model · learns from your sessions';
  }
  if (which === 'dead') {
    $('#dead-title').textContent = `${p.name} has died.`;
    $('#dead-cause').textContent = `${CAUSES[p.cause] || 'Cause unknown'}. Lived ${fmtLife(p.born, p.died)}, with ${fmtDur(p.focusSec)} of focus.`;
    $('#new-name').placeholder = defaultName(p.gen + 1);
  }
  renderJack();
  renderLive();
}

function renderLive() {
  const s = state.session;
  if (!s) return;
  if (s.mode === 'focus') {
    const rem = remainingSec(s);
    $('#run-clock').textContent = fmtClock(rem);
    $('#run-fill').style.width = `${Math.min(100, (1 - rem / s.plannedSec) * 100)}%`;
    $('#run-trips').textContent = s.trips;
    $('#run-away').textContent = fmtDur(s.unexcusedSec);
    $('#run-passes').textContent = Math.max(0, WORK_PASSES - s.workClaims);
    if (s.risk != null) {
      const pct = Math.round(s.risk * 100);
      $('#risk-val').textContent = `${pct}%`;
      $('#risk-fill').style.width = `${Math.min(100, pct)}%`;
      $('#run-risk').classList.toggle('is-high', s.risk >= NUDGE.risk);
    }
    $('#conf-timer').textContent = s.timeUp ? "Time's up. Confess to see your grade." : `Timer's still running: ${fmtClock(rem)} left.`;
  } else {
    $('#break-clock').textContent = fmtClock(remainingSec(s));
    $('#break-fill').style.width = `${Math.min(100, (1 - remainingSec(s) / s.plannedSec) * 100)}%`;
  }
}

const syncChips = () => $('#chips').querySelectorAll('[data-min]').forEach(b => {
  const on = !$('#custom-min').value && +b.dataset.min === state.settings.minutes;
  b.classList.toggle('is-on', on);
  b.setAttribute('aria-checked', on);
});

// Once there's enough history, the length your survival curve recommends gets a "for you" chip.
function renderChips() {
  const custom = $('#custom-min')?.value || '';
  const opts = [...(DEMO ? [[1 / 6, '10s']] : []), [1, '1 min', 'test drive'], [15, '15'], [25, '25'], [50, '50']];
  if (rec) {
    const same = opts.find(([m]) => m === rec.minutes), at = opts.findIndex(([m]) => m > rec.minutes);
    if (same) same[2] = 'for you';
    else opts.splice(at < 0 ? opts.length : at, 0, [rec.minutes, String(rec.minutes), 'for you']);
  }
  const why = rec ? ` title="From your last ${survival(state.sessions).n} sessions: about ${Math.round(rec.target * 100)}% stay slip-free this long"` : '';
  $('#chips').innerHTML = opts.map(([m, label, sub]) =>
    `<button type="button" class="chip" role="radio" data-min="${m}" aria-checked="false"${sub === 'for you' ? why : ''}>${label}${sub ? `<small>${sub}</small>` : ''}</button>`).join('') +
    `<label class="chip chip-custom"><input id="custom-min" type="number" inputmode="numeric" min="1" max="180" placeholder="Custom" aria-label="Custom minutes"><span>min</span></label>`;
  $('#custom-min').value = custom;
  syncChips();
}

function buildChips() {
  const chips = $('#chips');
  chips.addEventListener('click', e => {
    const b = e.target.closest('[data-min]');
    if (!b) return;
    state.settings.minutes = +b.dataset.min;
    $('#custom-min').value = '';
    syncChips();
    save();
  });
  chips.addEventListener('input', syncChips);
  renderChips();
}

function buildCulprits() {
  $('#culprits').innerHTML = CULPRITS.map(c =>
    `<button type="button" class="culprit" data-key="${c.key}"><span class="em" aria-hidden="true">${c.emoji}</span><span>${c.label}</span></button>`).join('') +
    `<button type="button" class="culprit culprit-work" data-key="work"><span class="em" aria-hidden="true">📚</span><span>Working in another tab, I swear<small id="work-sub"></small></span></button>`;
  $('#culprits').addEventListener('click', e => {
    const b = e.target.closest('[data-key]');
    if (b) confess(b.dataset.key);
  });
}

$('#setup-form').addEventListener('submit', e => {
  e.preventDefault();
  unlock();
  const custom = parseFloat($('#custom-min').value);
  startSession($('#task').value.trim(), custom > 0 ? Math.min(180, custom) : state.settings.minutes);
});

$('#btn-pause').addEventListener('click', () => {
  const s = state.session;
  if (!s) return;
  if (s.pausedAt) {
    s.pausedMs += now() - s.pausedAt;
    s.pausedAt = null;
    say(pick(LINES.resume), 'focused', 3000);
  } else {
    s.pausedAt = now();
    say(pick(LINES.pause), 'happy', 3000);
  }
  save();
  renderPanel();
  updateTitle();
});

$('#btn-giveup').addEventListener('click', async () => {
  const ok = await confirmBox({
    title: 'Give up on this session?',
    body: `${state.pumpkin.name} takes +${ABANDON_ROT}% rot and you get no focus credit. ${state.pumpkin.name} will remember this.`,
    ok: 'Give up',
  });
  if (ok) abandon();
});

$('#btn-skip-break').addEventListener('click', () => endBreak(true));

$('#replant-form').addEventListener('submit', e => {
  e.preventDefault();
  unlock();
  state.pumpkin = newPumpkin(state.pumpkin.gen + 1, $('#new-name').value);
  state.lastActiveAt = now();
  $('#new-name').value = '';
  lastRot = null;
  save();
  mood = 'happy';
  renderJack(true);
  renderPanel();
  updateTitle();
  say(pick(LINES.newPumpkin), 'celebrate', 4000);
});

// ---------- dialogs ----------

let lastReport = null;

function openReport({ entry, grade, line, stagedUp }) {
  lastReport = { entry, grade, line, rot: state.pumpkin.rot, stage: stageIndex(state.pumpkin.focusSec), name: state.pumpkin.name };
  $('#rep-letter').textContent = grade.letter;
  $('#rep-letter').dataset.grade = grade.letter[0];
  $('#rep-name').textContent = grade.name;
  $('#rep-note').textContent = say_(grade.note);
  $('#rep-task').textContent = entry.task || 'Untitled grind';
  $('#rep-focused').textContent = `${fmtDur(entry.focusedSec)} / ${fmtDur(entry.plannedSec)}`;
  $('#rep-trips').textContent = entry.trips;
  $('#rep-top').textContent = entry.top ? CULPRITS.find(c => c.key === entry.top).label : 'None 🎉';
  $('#rep-stageup').hidden = !stagedUp;
  if (stagedUp) $('#rep-stageup').textContent = `🌟 ${state.pumpkin.name} grew into a ${stagedUp}!`;
  $('#modal-report').showModal();
}

$('#rep-break').addEventListener('click', () => { $('#modal-report').close(); startBreak(); });
$('#rep-again').addEventListener('click', () => {
  $('#modal-report').close();
  startSession(lastReport.entry.task, lastReport.entry.plannedSec / 60);
});
$('#rep-save').addEventListener('click', () => saveCard('report', lastReport));

let lastGrave = null;
function openDeath(grave) {
  lastGrave = grave;
  $('#death-jack').innerHTML = renderPumpkin({ rot: 100, mood: 'dead', stage: grave.stage });
  $('#death-name').textContent = grave.name;
  $('#death-dates').textContent = `${fmtDate(grave.born)} – ${fmtDate(grave.died)}`;
  $('#death-stats').textContent = `${fmtDur(grave.focusSec)} focused · ${grave.sessions} session${grave.sessions === 1 ? '' : 's'}`;
  $('#death-cause').textContent = CAUSES[grave.cause];
  $('#death-epitaph').textContent = `“${grave.epitaph}”`;
  $('#modal-death').showModal();
}
$('#death-save').addEventListener('click', () => saveCard('obit', lastGrave));
$('#death-close').addEventListener('click', () => {
  $('#modal-death').close();
  say(pick(LINES.dead));
  $('#new-name').focus({ preventScroll: true });
});

function confirmBox({ title, body, ok }) {
  return new Promise(resolve => {
    const d = $('#modal-confirm');
    $('#cf-title').textContent = title;
    $('#cf-body').textContent = body;
    $('#cf-ok').textContent = ok;
    d.returnValue = '';
    d.onclose = () => resolve(d.returnValue === 'ok');
    d.showModal();
  });
}

// ---------- share cards ----------

function svgImage(svg) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = reject;
    img.src = url;
  });
}

function wrapText(x, text, cx, y, maxW, lh) {
  const lines = [];
  let line = '';
  for (const w of text.split(' ')) {
    const tryLine = line ? `${line} ${w}` : w;
    if (x.measureText(tryLine).width > maxW && line) { lines.push(line); line = w; } else line = tryLine;
  }
  lines.push(line);
  lines.forEach((l, i) => x.fillText(l, cx, y + i * lh));
  return lines.length;
}

async function saveCard(kind, data) {
  if (!data) return;
  await document.fonts.ready;
  const W = 1080, H = 1350;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const x = c.getContext('2d');
  const serif = '"Fraunces", Georgia, serif', sans = '"DM Sans", system-ui, sans-serif';

  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2b1d47');
  bg.addColorStop(0.6, '#170f26');
  bg.addColorStop(1, '#0f0a18');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#fff';
  for (let i = 0; i < 110; i++) {
    x.globalAlpha = 0.15 + rnd() * 0.6;
    x.beginPath();
    x.arc(rnd() * W, rnd() * H * 0.7, rnd() * 2 + 0.5, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  const glow = x.createRadialGradient(W / 2, 540, 30, W / 2, 540, 480);
  glow.addColorStop(0, kind === 'report' ? 'rgba(255,150,40,.38)' : 'rgba(160,175,120,.22)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = glow;
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#0b0712';
  x.beginPath();
  x.moveTo(0, H); x.lineTo(0, 1200);
  x.quadraticCurveTo(270, 1130, 540, 1190);
  x.quadraticCurveTo(810, 1250, W, 1170);
  x.lineTo(W, H);
  x.fill();

  x.textAlign = 'center';
  x.fillStyle = '#ffb347';
  x.font = `700 28px ${sans}`;
  if ('letterSpacing' in x) x.letterSpacing = '10px';
  x.fillText('GOURDIAN', W / 2, 92);
  if ('letterSpacing' in x) x.letterSpacing = '0px';

  if (kind === 'report') {
    const { entry, grade, line, rot, stage, name } = data;
    x.fillStyle = '#f7ecd9';
    x.font = `700 64px ${serif}`;
    x.fillText('Focus Report Card', W / 2, 172);
    x.fillStyle = '#b9abc9';
    x.font = `500 32px ${sans}`;
    x.fillText((entry.task || 'Untitled grind').slice(0, 44), W / 2, 222);
    x.drawImage(await svgImage(renderPumpkin({ rot, mood: 'celebrate', stage, animated: false, size: 680 })), W / 2 - 340, 228, 680, 578);
    const gx = 820, gy = 690;
    const badge = x.createLinearGradient(gx - 100, gy - 100, gx + 100, gy + 100);
    badge.addColorStop(0, '#ffc15e');
    badge.addColorStop(1, '#f07a12');
    x.fillStyle = badge;
    x.beginPath(); x.arc(gx, gy, 104, 0, Math.PI * 2); x.fill();
    x.lineWidth = 8; x.strokeStyle = '#170f26'; x.stroke();
    x.fillStyle = '#2a1405';
    x.font = `800 ${grade.letter.length > 1 ? 96 : 120}px ${serif}`;
    x.fillText(grade.letter, gx, gy + (grade.letter.length > 1 ? 34 : 42));
    x.fillStyle = '#ffb347';
    x.font = `700 62px ${serif}`;
    x.fillText(grade.name, W / 2, 868);
    x.fillStyle = '#b9abc9';
    x.font = `400 30px ${sans}`;
    x.fillText(fill(grade.note, { name }), W / 2, 916);
    const cols = [
      ['Focused', fmtDur(entry.focusedSec)],
      ['Trips away', String(entry.trips)],
      ['Top distraction', entry.top ? CULPRITS.find(cu => cu.key === entry.top).label : 'None'],
    ];
    cols.forEach(([label, val], i) => {
      const cx = 200 + i * 340;
      x.fillStyle = '#9d8fb0';
      x.font = `500 26px ${sans}`;
      x.fillText(label, cx, 1000);
      x.fillStyle = '#f7ecd9';
      x.font = `700 44px ${sans}`;
      x.fillText(val, cx, 1056);
    });
    x.fillStyle = '#e9dcc6';
    x.font = `italic 500 32px ${serif}`;
    const n = wrapText(x, `“${line}”`, W / 2, 1136, 860, 42);
    x.fillStyle = '#9d8fb0';
    x.font = `500 26px ${sans}`;
    x.fillText(`— ${name}`, W / 2, 1136 + n * 42 + 4);
  } else {
    const g = data;
    x.fillStyle = '#f7ecd9';
    x.font = `600 56px ${serif}`;
    x.fillText('In Loving Memory', W / 2, 168);
    x.drawImage(await svgImage(renderPumpkin({ rot: 100, mood: 'dead', stage: g.stage, animated: false, size: 440 })), W / 2 - 220, 200, 440, 374);
    x.fillStyle = '#2a2338';
    x.strokeStyle = '#463c5c';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(200, 1210); x.lineTo(200, 910);
    x.arc(W / 2, 910, 340, Math.PI, 0);
    x.lineTo(880, 1210); x.closePath();
    x.fill(); x.stroke();
    x.fillStyle = '#9d8fb0';
    x.font = `700 28px ${sans}`;
    if ('letterSpacing' in x) x.letterSpacing = '8px';
    x.fillText('R.I.P.', W / 2, 668);
    if ('letterSpacing' in x) x.letterSpacing = '0px';
    x.fillStyle = '#f7ecd9';
    x.font = `700 76px ${serif}`;
    x.fillText(g.name, W / 2, 752);
    x.fillStyle = '#b9abc9';
    x.font = `500 32px ${sans}`;
    x.fillText(`${fmtDate(g.born)} – ${fmtDate(g.died)}`, W / 2, 806);
    x.fillStyle = '#f7ecd9';
    x.font = `500 34px ${sans}`;
    x.fillText(`${fmtDur(g.focusSec)} focused · ${g.sessions} session${g.sessions === 1 ? '' : 's'}`, W / 2, 890);
    x.fillStyle = '#ffb347';
    x.font = `700 44px ${serif}`;
    const cl = wrapText(x, CAUSES[g.cause], W / 2, 970, 600, 52);
    x.fillStyle = '#e9dcc6';
    x.font = `italic 500 34px ${serif}`;
    wrapText(x, `“${g.epitaph}”`, W / 2, 1010 + cl * 52, 560, 44);
  }

  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    x.fillStyle = '#7f7193';
    x.font = `500 26px ${sans}`;
    x.fillText((location.host + location.pathname).replace(/index\.html$/, '').replace(/\/$/, ''), W / 2, 1300);
  }

  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const name = kind === 'report' ? 'gourdian-report-card.png' : `gourdian-obituary-${data.name.toLowerCase().replace(/\W+/g, '-')}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Gourdian' }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- stats + graveyard ----------

function streak() {
  const days = new Set(state.sessions.filter(s => s.focusedSec != null).map(s => new Date(s.at).toDateString()));
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function renderStats() {
  const T = state.totals, p = state.pumpkin;
  $('#t-focus').textContent = T.focusSec < 60 ? '0m' : fmtDur(T.focusSec);
  $('#t-sessions').textContent = T.sessions;
  $('#t-lost').textContent = state.graveyard.length;
  $('#t-streak').textContent = streak();

  const rows = Object.entries(state.culprits).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] || 1;
  $('#killers').innerHTML = rows.length
    ? rows.map(([k, v]) => {
      const cu = CULPRITS.find(c => c.key === k);
      return `<li title="${esc(cu.label)}: ${fmtDur(v)}"><span class="bar-label"><span aria-hidden="true">${cu.emoji}</span> ${esc(cu.label)}</span>` +
        `<span class="bar-track"><span class="bar" style="width:${Math.max(3, (v / max) * 100).toFixed(1)}%"></span></span><span class="bar-val">${fmtDur(v)}</span></li>`;
    }).join('')
    : '<li class="empty">No confessions yet. Suspiciously clean.</li>';
  $('#excused').textContent = T.workClaims
    ? `“Working in another tab, I swear” claimed ${T.workClaims} time${T.workClaims === 1 ? '' : 's'}. ${p.name} believes you. Mostly.`
    : '';

  const stage = stageIndex(p.focusSec), next = STAGES[stage + 1];
  $('#pc-jack').innerHTML = renderPumpkin({ rot: p.rot, mood: p.dead ? 'dead' : 'happy', stage });
  $('#pc-name').textContent = p.name;
  $('#pc-meta').textContent = `${p.dead ? 'Deceased' : STAGES[stage].name} · planted ${fmtAge(p.born)}`;
  const span = next ? next.min * 60 - STAGES[stage].min * 60 : 1;
  $('#pc-fill').style.width = `${next ? Math.min(100, ((p.focusSec - STAGES[stage].min * 60) / span) * 100) : 100}%`;
  $('#pc-next').textContent = p.dead ? 'Plant a new pumpkin from the Focus tab.' : next ? `${fmtDur(next.min * 60 - p.focusSec)} more focus to ${next.name}` : 'Final form. Nothing left to grow into.';
  $('#pc-focus').textContent = p.focusSec < 60 ? '0m' : fmtDur(p.focusSec);
  $('#pc-sessions').textContent = p.sessions;
  $('#pc-fresh').textContent = `${Math.round(100 - p.rot)}%`;

  const recent = state.sessions.slice(0, 12);
  $('#sessions-body').innerHTML = recent.length
    ? recent.map(s => `<tr><td>${fmtDate(s.at)}</td><td class="task-cell">${esc(s.task || 'Untitled grind')}</td><td>${fmtDur(s.plannedSec)}</td>` +
      `<td>${s.trips}</td><td><span class="grade-pill" data-grade="${esc(s.abandoned ? 'X' : s.grade[0])}">${s.abandoned ? 'Quit' : esc(s.grade)}</span></td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">No sessions yet. The timer is right there.</td></tr>';
}

function renderGraveyard() {
  const g = state.graveyard;
  $('#graves').innerHTML = g.length
    ? g.map((d, i) => `<article class="grave">
        <div class="grave-jack">${renderPumpkin({ rot: 100, mood: 'dead', stage: d.stage, animated: false })}</div>
        <p class="rip">R.I.P.</p><h3>${esc(d.name)}</h3>
        <p class="dates">${fmtDate(d.born)} – ${fmtDate(d.died)}</p>
        <p class="cause">${esc(CAUSES[d.cause])}</p>
        <p class="small">${fmtDur(d.focusSec)} focused · ${d.sessions} session${d.sessions === 1 ? '' : 's'}</p>
        <p class="epitaph">“${esc(d.epitaph)}”</p>
        <button type="button" class="btn btn-ghost btn-sm" data-obit="${i}">Save obituary</button>
      </article>`).join('')
    : `<div class="card empty-grave"><p class="big" aria-hidden="true">🌱</p><p><strong>No pumpkins have died… yet.</strong></p>
        <p class="muted">Keep it that way. ${esc(state.pumpkin.name)} is watching.</p></div>`;
}

$('#graves').addEventListener('click', e => {
  const b = e.target.closest('[data-obit]');
  if (b) saveCard('obit', state.graveyard[+b.dataset.obit]);
});

// ---------- insights ----------

const tip = makeTip($('#tip'));
let insightsSource = null, sampleCache = null;
const pct = v => `${Math.round(v * 100)}%`;
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const fmtMin = m => (m < 1 ? '<1 min' : `${Math.round(m)} min`);
const signed = v => (Math.round(v) > 0 ? `+${Math.round(v)}` : Math.round(v) < 0 ? `−${-Math.round(v)}` : '0');
const culpritName = k => (k === 'work' ? '📚 Work, another tab' : (c => `${c.emoji} ${c.label}`)(CULPRITS.find(c => c.key === k)));

function insightData() {
  if (insightsSource === 'sample') return (sampleCache ||= (sessions => ({ sessions, a: analyze(sessions) }))(sampleSessions()));
  return (analysisCache ||= { sessions: state.sessions, a: analyze(state.sessions) });
}

function renderInsights() {
  const mine = usable(state.sessions).length;
  insightsSource ??= mine >= 3 ? 'mine' : 'sample';
  const sample = insightsSource === 'sample';
  document.querySelectorAll('#ins-source [data-source]').forEach(b => {
    const on = b.dataset.source === insightsSource;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', on);
  });
  $('#src-n').textContent = plural(mine, 'session');
  const { a } = insightData(), km = a.km;
  const banner = $('#ins-banner');
  banner.hidden = !sample && mine >= 8;
  banner.innerHTML = sample
    ? 'This is a <strong>synthetic student</strong>: six weeks of sessions generated from a model we wrote down (a night owl with a TikTok habit), so you can see what Gourdian learns. None of it is real data.'
    : mine
      ? `${plural(mine, 'session')} logged with trip timing so far. Expect wide intervals until there are 10 or more.`
      : 'No sessions logged yet. Finish a few and this page fills in. Until then, the <strong>Sample student</strong> shows what it looks like.';

  // Headline tiles
  const median = km.points.find(p => p.s <= 0.5);
  // The median's interval: where the lower and upper bands cross 50%.
  const ciLo = km.points.find(p => p.lo <= 0.5), ciHi = km.points.find(p => p.hi <= 0.5);
  const few = km.n < 3;
  $('#i-median').textContent = few ? '–' : median ? fmtMin(median.t) : `${Math.round(km.maxT)}+ min`;
  $('#i-median-sub').textContent = few ? 'needs 3 sessions' : !median ? 'over half never slipped'
    : km.n >= 5 && ciLo ? `95% CI ${Math.round(ciLo.t)}–${ciHi ? Math.round(ciHi.t) : '?'} min` : 'interval still wide';
  $('#i-rec').textContent = a.rec ? `${a.rec.minutes} min` : '–';
  $('#i-rec-sub').textContent = a.rec ? (a.rec.capped ? 'no drop-off seen yet' : `≈${pct(a.rec.target)} stay slip-free`) : 'needs 5 sessions';
  $('#i-clean').textContent = a.cleanRate == null ? '–' : pct(a.cleanRate);
  $('#i-clean-sub').textContent = a.sessions ? `${Math.round(a.cleanRate * a.sessions)} of ${plural(a.sessions, 'session')}` : '';
  $('#i-rate').textContent = a.slipsPerHour == null ? '–' : a.slipsPerHour.toFixed(1);
  $('#i-rate-sub').textContent = a.focusMin ? `${plural(a.slips, 'slip')} in ${fmtDur(a.focusMin * 60)}` : '';

  // Charts are drawn at their real pixel width so the text stays readable on phones.
  const w = id => $(id).clientWidth || 320;
  $('#ch-survival').innerHTML = km.n ? survivalChart(km, { width: w('#ch-survival'), rec: a.rec }) : '<p class="empty">No sessions yet.</p>';
  if (km.n) bindSurvival($('#ch-survival'), km, tip);
  const at25 = km.n && 25 <= km.maxT ? km.points.filter(p => p.t <= 25).pop() : null;
  $('#n-survival').textContent = !km.n ? '' : at25
    ? `${pct(at25.s)} of sessions reach minute 25 without a slip.${a.rec && !a.rec.capped ? ` The curve drops below ${pct(a.rec.target)} around minute ${Math.round(a.rec.raw)}, so ${a.rec.minutes}-minute sessions fit you best.` : ''}`
    : `${plural(km.n, 'session')}, ${km.events} with a slip.`;

  const hr = a.hourly, parts = a.dayparts.filter(d => d.exposure >= 1).sort((x, y) => y.rate - x.rate);
  $('#ch-hours').innerHTML = hr.exposure ? hoursChart(hr, { width: w('#ch-hours') }) : '<p class="empty">No focus time logged yet.</p>';
  const [hi, lo] = [parts[0], parts.at(-1)];
  $('#n-hours').textContent = parts.length >= 2 && lo.rate > 0
    ? `You slip ${(hi.rate / lo.rate).toFixed(1)}× as often on ${hi.label} as on ${lo.label}: ${hi.rate.toFixed(1)} vs. ${lo.rate.toFixed(1)} slips per focus hour.`
    : parts.length >= 2 ? `No slips at all on ${lo.label} so far.` : '';

  $('#ch-effects').innerHTML = effectsChart(a.effects, { width: w('#ch-effects') });
  $('#n-effects').textContent = a.model.n
    ? `Fit on ${plural(a.model.n, 'watched minute')} with ${plural(a.model.events, 'slip')}, starting from a weak prior that your data overrides as it grows.`
    : 'No data yet, so this is the starter prior: a guess, not a finding.';

  $('#cost-body').innerHTML = a.culprits.length
    ? a.culprits.map(c => `<tr><td>${esc(culpritName(c.c))}</td><td>${c.count}</td><td>${fmtDur(c.median)}</td><td>${fmtDur(c.p90)}</td><td>${fmtDur(c.total)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">No trips away yet.</td></tr>';
  const away = a.culprits.filter(c => c.c !== 'work'), total = away.reduce((s, c) => s + c.total, 0);
  $('#n-cost').textContent = away.length
    ? `${culpritName(away[0].c).replace(/^\S+ /, '')} accounts for ${pct(away[0].total / total)} of unexcused time away. “Typical” is the median trip; “worst 10%” is the 90th percentile.`
    : '';

  const ck = a.check;
  $('.calib').hidden = !ck;
  if (ck) {
    const cell = (label, val, sub) => `<div><dt>${label}</dt><dd>${val}</dd><p class="small muted">${sub}</p></div>`;
    $('#check-stats').innerHTML =
      cell('Ranking (AUC)', ck.auc.toFixed(2), `starter prior ${ck.aucPrior.toFixed(2)} · coin flip 0.50`) +
      cell('Brier skill', `${ck.skill >= 0 ? '+' : ''}${(ck.skill * 100).toFixed(1)}%`, 'vs. a constant slip rate') +
      cell('Log loss', ck.logLoss.toFixed(3), `constant rate ${ck.logLossBase.toFixed(3)} · prior ${ck.logLossPrior.toFixed(3)}`) +
      cell('Held-out test', `${ck.testSessions} sessions`, `${ck.testMinutes} minutes · ${ck.testEvents} slips`);
    $('#ch-calib').innerHTML = calibrationChart(ck.calibration, { width: w('#ch-calib') });
    $('#n-check').innerHTML = 'Slips in any single minute are rare and noisy, so modest scores are normal. The <a href="https://github.com/ashank-crazy/gourdian/blob/main/analysis/RESULTS.md" target="_blank" rel="noopener">validation study</a> checks the same code on 200 synthetic students with known ground truth.';
  } else {
    $('#check-stats').innerHTML = '<p class="empty">Needs at least 8 sessions with trip timing, and slips in the newest few, before there is anything fair to test on.</p>';
    $('#ch-calib').innerHTML = '';
    $('#n-check').textContent = '';
  }

  const nd = a.nudges;
  const arm = (name, x) => `<div><dt>${name}</dt><dd>${x.n ? pct(x.slips / x.n) : '–'}</dd><p class="small muted">${x.slips} of ${x.n} slipped within 5 min</p></div>`;
  $('#nudge-body').innerHTML = nd.sent.n + nd.held.n
    ? `<dl class="check-stats two">${arm('Jack warned you', nd.sent)}${arm('Jack stayed quiet', nd.held)}</dl>` +
      `<p class="chart-note">${nd.diff == null ? 'Needs moments in both groups before it can compare them.'
        : `Warnings changed the 5-minute slip rate by ${signed(nd.diff * 100)} points (95% CI ${signed(nd.lo * 100)} to ${signed(nd.hi * 100)}).` +
          (nd.hi < 0 ? ' They help.' : nd.lo > 0 ? ' They seem to backfire.' : ' Too early to call either way.')}</p>`
    : '<p class="empty">No high-risk moments logged yet. They show up once the model expects a slip within 5 minutes.</p>';
  $('#exp-toggle').checked = state.settings.experiment;

  const who = sample ? 'the synthetic student' : 'your data';
  $('#n-export').textContent = `Exports ${who}. Columns are described in the project README.`;
}

function buildInsights() {
  bindTips($('#view-insights'), tip);
  $('#ins-source').addEventListener('click', e => {
    const b = e.target.closest('[data-source]');
    if (!b) return;
    insightsSource = b.dataset.source;
    renderInsights();
  });
  $('#exp-toggle').addEventListener('change', e => { state.settings.experiment = e.target.checked; save(); });
  $('#exp-sessions').addEventListener('click', () => exportData('sessions'));
  $('#exp-trips').addEventListener('click', () => exportData('trips'));
  $('#exp-json').addEventListener('click', () => exportData('json'));
  let rt = null, lastW = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (innerWidth !== lastW && !$('#view-insights').hidden) renderInsights();
      lastW = innerWidth;
    }, 150);
  });
}

function exportData(kind) {
  const { sessions } = insightData(), tag = insightsSource === 'sample' ? 'sample' : 'mine';
  const tables = sessionTable(sessions);
  const [name, text, type] = kind === 'json'
    ? [`gourdian-${tag}.json`, JSON.stringify({ schema: 'gourdian-sessions/1', exported: new Date().toISOString(), synthetic: tag === 'sample', features: FEATURES.map(f => f.key), sessions: usable(sessions) }, null, 2), 'application/json']
    : [`gourdian-${kind}-${tag}.csv`, toCSV(tables[kind]), 'text/csv'];
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

$('#btn-reset').addEventListener('click', async () => {
  const ok = await confirmBox({ title: 'Reset everything?', body: 'This deletes your pumpkin, stats, and graveyard from this browser. There is no undo.', ok: 'Reset' });
  if (!ok) return;
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
  location.reload();
});

// ---------- views ----------

const VIEWS = ['focus', 'stats', 'insights', 'graveyard'];
function showView() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'focus';
  for (const n of VIEWS) $(`#view-${n}`).hidden = n !== v;
  document.querySelectorAll('.tabs a').forEach(a => a.toggleAttribute('aria-current', a.dataset.view === v));
  if (v === 'stats') renderStats();
  if (v === 'insights') renderInsights();
  if (v === 'graveyard') renderGraveyard();
}
window.addEventListener('hashchange', () => { showView(); scrollTo(0, 0); });

// ---------- toggles ----------

function syncToggles() {
  const { muted, notify: on } = state.settings;
  $('#btn-sound').setAttribute('aria-pressed', String(!muted));
  $('#btn-sound').title = muted ? 'Sound off' : 'Sound on';
  $('#btn-notify').setAttribute('aria-pressed', String(on));
  $('#btn-notify').title = on ? 'Nagging on: notifications when you wander off' : 'Let Jack nag you with notifications';
  setMuted(muted);
}

$('#btn-sound').addEventListener('click', () => {
  state.settings.muted = !state.settings.muted;
  syncToggles();
  unlock();
  if (!state.settings.muted) sfx.poke();
  save();
});

$('#btn-notify').addEventListener('click', async () => {
  if (state.settings.notify) {
    state.settings.notify = false;
  } else if ('Notification' in window) {
    const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    state.settings.notify = perm === 'granted';
    say(pick(state.settings.notify ? LINES.notifyOn : LINES.denied), state.settings.notify ? 'happy' : 'sad', 3000);
  } else {
    say(pick(LINES.denied), 'sad', 3000);
  }
  syncToggles();
  save();
});

// ---------- backdrop ----------

const LEAF = 'M12 1.5c1.2 2.6 3 3.5 5.4 3-1 1.9-.6 3.2 1.4 4.3-2 .8-2.7 2-2 3.9-2-.5-3.4.1-3.8 2.1L12 22l-1-7.2c-.4-2-1.8-2.6-3.8-2.1.7-1.9 0-3.1-2-3.9 2-1.1 2.4-2.4 1.4-4.3 2.4.5 4.2-.4 5.4-3z';

function buildSky() {
  let stars = '';
  for (let i = 0; i < 90; i++) {
    const tw = Math.random() < 0.3 ? ` class="tw" style="animation-delay:-${(Math.random() * 4).toFixed(1)}s"` : '';
    stars += `<circle cx="${(Math.random() * 100).toFixed(2)}%" cy="${(Math.random() * 68).toFixed(2)}%" r="${(Math.random() * 1.2 + 0.3).toFixed(2)}" opacity="${(Math.random() * 0.6 + 0.2).toFixed(2)}"${tw}/>`;
  }
  $('#stars').innerHTML = stars;
  if (reduceMotion) return;
  const colors = ['#e8792b', '#c94f2a', '#f2b04a', '#a8562a', '#d9922e'];
  $('#leaves').innerHTML = Array.from({ length: 12 }, () =>
    `<span class="leaf" style="--x:${(Math.random() * 100).toFixed(1)}vw;--s:${(14 + Math.random() * 16).toFixed(0)}px;--d:${(13 + Math.random() * 14).toFixed(1)}s;--delay:-${(Math.random() * 24).toFixed(1)}s">` +
    `<svg viewBox="0 0 24 24"><path fill="${pick(colors)}" d="${LEAF}"/></svg></span>`).join('');
}

// ---------- boot ----------

function init() {
  buildSky();
  buildChips();
  buildCulprits();
  buildInsights();
  refreshModel();
  $('.risk-mark').style.left = `${NUDGE.risk * 100}%`;
  syncToggles();
  $('#task').value = state.settings.lastTask || '';

  // Resume a session from a reloaded or closed tab. Time the tab was closed counts as time away.
  const s = state.session;
  if (s?.mode === 'break' && remainingSec(s) <= 0) state.session = null;
  if (s?.mode === 'focus') {
    if (!s.pausedAt && !s.awayStart && s.lastBeat && now() - s.lastBeat > GRACE_MS) {
      s.awayStart = s.lastBeat;
      s.awayAtSec = (s.lastBeat - s.startedAt - s.pausedMs) / 1000;
    }
    if (remainingSec(s) <= 0) s.timeUp = true;
    updateRisk(true);
  }
  const decayDays = applyDecay();

  mood = baseMood();
  renderJack(true);
  renderPanel();
  updateTitle();
  updateFavicon();
  showView();

  const live = state.session;
  if (state.pumpkin.rot >= 100 && !state.pumpkin.dead) die('neglect');
  else if (live?.awayStart && !document.hidden) onReturn();
  else if (live?.pendingTrip) openConfession();
  else if (decayDays) say(pick(LINES.decay).replace('{n}', decayDays === 1 ? '1 day' : `${decayDays} days`), 'sad');
  else if (state.pumpkin.dead) say(pick(LINES.dead));
  else if (live) say(pick(LINES.resumeSession));
  else say(pick(state.totals.sessions ? LINES.welcomeBack : LINES.idle));

  addEventListener('pagehide', save);
  startTicker();
}

init();
