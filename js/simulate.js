// Synthetic students for the Insights demo and for validating the analytics in analysis/.
// Every session is generated minute by minute from a known hazard model, so the ground truth is
// on record and the estimators can be checked against it. Output matches the app's session log.

import { features, sigmoid, riskAhead, starterModel, PRIOR, NUDGE } from './insights.js';
import { CULPRITS, GRADES } from './lines.js';

// Seeded PRNG (mulberry32), so a seed always produces the same student.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = r => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const pickW = (r, items, w) => {
  let u = r() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < items.length; i++) if ((u -= w[i]) <= 0) return items[i];
  return items[items.length - 1];
};
const poisson = (r, lam) => {
  let k = 0, p = Math.exp(-lam), s = p;
  const u = r();
  while (u > s && k < 20) { k++; p *= lam / k; s += p; }
  return k;
};

const KEYS = CULPRITS.map(c => c.key);
// Median minutes away per trip. Feeds are the long ones; texting is short.
export const TRIP_MEDIAN_MIN = { instagram: 3, tiktok: 7, youtube: 9, texting: 2, games: 12, shopping: 6, snack: 5, void: 4, work: 3 };
const STARTS = [9.5, 14.5, 19.5, 23]; // typical session start hours: morning, afternoon, evening, late night
const TASKS = ['Calc II problem set', 'Orgo reading', 'CECS 274 lab', 'History essay draft', 'Physics lab report', 'Spanish flashcards', 'Data structures HW'];

// A student: personal hazard coefficients drawn around `center`, plus habits (when, how long, where to).
export function makeStudent(r, { center = PRIOR.mean, spread = 0.35, nudgeEffect = -0.4 } = {}) {
  const fav = Math.floor(r() * KEYS.length);
  return {
    beta: center.map((m, j) => m + normal(r) * spread * (j === 0 ? 1.4 : 1)),
    culpritW: KEYS.map((_, i) => (i === fav ? 4 : 0.2 + r() ** 2)),
    startW: STARTS.map(() => 0.2 + r()),
    lengths: [15, 25, 50], lengthW: [0.5 + r(), 2 + r() * 2, 0.3 + r()],
    perDay: 0.8 + r() * 1.6,
    workRate: 0.003 + r() * 0.008,
    sigma: 0.6 + r() * 0.3,
    nudgeEffect,
  };
}

function simulateSession(st, r, startedAt, { nudges = true, policyModel = starterModel() } = {}) {
  const plannedMin = pickW(r, st.lengths, st.lengthW), plannedSec = plannedMin * 60;
  const away = [], decisions = [];
  let pos = 0, slips = 0, unexcused = 0, lastDecision = -Infinity, sentUntil = -1, abandonedAt = null;
  while (pos < plannedSec) {
    const k = Math.floor(pos / 60), end = Math.min(plannedSec, (k + 1) * 60);
    const wall = new Date(startedAt + k * 60000);
    if (nudges && k - lastDecision >= NUDGE.cooldownMin && k >= 1) {
      const risk = riskAhead(policyModel, { minute: k, slipped: slips > 0, plannedMin, at: wall.getTime() }, NUDGE.horizonMin);
      if (risk >= NUDGE.risk) {
        const sent = r() < NUDGE.p;
        decisions.push({ m: k, r: Math.round(risk * 1000) / 1000, sent });
        lastDecision = k;
        if (sent) sentUntil = k + NUDGE.horizonMin;
      }
    }
    const x = features({ minute: k, slipped: slips > 0, hour: wall.getHours(), weekend: [0, 6].includes(wall.getDay()), plannedMin });
    const z = x.reduce((s, v, i) => s + v * st.beta[i], 0) + (k < sentUntil ? st.nudgeEffect : 0);
    const slip = r() < sigmoid(z), work = !slip && r() < st.workRate;
    if (!slip && !work) { pos = end; continue; }
    const c = slip ? pickW(r, KEYS, st.culpritW) : 'work';
    const at = Math.floor(pos + r() * (end - pos));
    const d = Math.round(Math.min(plannedSec - at, Math.max(11, TRIP_MEDIAN_MIN[c] * 60 * Math.exp(normal(r) * st.sigma))));
    pos = at + d;
    if (d < 10) continue; // too short to count: a peek
    away.push({ t: at, d, c });
    if (slip) { slips++; unexcused += d; }
    if (unexcused > plannedSec * 0.5 && r() < 0.35) { abandonedAt = Math.min(plannedSec, pos); break; }
  }
  const elapsedSec = abandonedAt ?? plannedSec;
  const tally = {};
  for (const e of away) if (e.c !== 'work') tally[e.c] = (tally[e.c] || 0) + e.d;
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const entry = {
    task: TASKS[Math.floor(r() * TASKS.length)], startedAt, at: startedAt + elapsedSec * 1000, plannedSec, elapsedSec,
    unexcusedSec: unexcused, trips: away.length, top, away, peeks: poisson(r, 0.6), nudges: decisions, grade: '—',
  };
  if (abandonedAt != null) return { ...entry, abandoned: true };
  const ratio = Math.max(0, 1 - unexcused / plannedSec);
  const grade = GRADES.find(g => ratio >= g.min && (g.letter !== 'A+' || unexcused === 0));
  return { ...entry, grade: grade.letter, focusedSec: Math.round(plannedSec - unexcused) };
}

// `days` of sessions ending at `end`, newest first (the order the app stores them in).
export function simulate(st, r, { days = 42, end = Date.now(), ...opts } = {}) {
  const out = [];
  const last = new Date(end);
  for (let d = days; d >= 1; d--) {
    const day = new Date(last.getFullYear(), last.getMonth(), last.getDate() - d);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const starts = Array.from({ length: poisson(r, st.perDay * (weekend ? 0.6 : 1)) }, () => {
      const h = pickW(r, STARTS, st.startW) + normal(r) * 0.8;
      return day.getTime() + Math.max(6, Math.min(25.5, h)) * 3600000;
    }).sort((a, b) => a - b);
    let free = 0;
    for (const t0 of starts) {
      const s = simulateSession(st, r, Math.max(t0, free), opts);
      free = s.at + 5 * 60000; // leave room for a break before the next one
      out.push(s);
    }
  }
  return out.reverse();
}

// The student shown under "Sample student" on the Insights page: a night owl with a TikTok habit.
// Always the same six weeks, shifted forward by whole weeks so they end recently on the right weekdays.
// The seed was picked for a readable demo; analysis/validate.mjs scores the methods on random students.
export const SAMPLE_SEED = 17;
const SAMPLE_END = new Date(2026, 10, 1).getTime();
export function sampleSessions(now = Date.now()) {
  const weeks = Math.max(0, Math.floor((now - SAMPLE_END) / (7 * 86400000)));
  return sampleStudent().map(s => {
    // Move by calendar days, not milliseconds, so clock times survive a daylight-saving change.
    const d = new Date(s.startedAt);
    d.setDate(d.getDate() + weeks * 7);
    return { ...s, startedAt: d.getTime(), at: d.getTime() + (s.at - s.startedAt) };
  });
}
function sampleStudent() {
  const r = rng(SAMPLE_SEED);
  const st = makeStudent(r);
  Object.assign(st, {
    beta: [-4.1, 0.36, 0.75, -0.45, 0.2, 0.85, 0.25, -0.05],
    culpritW: KEYS.map(k => ({ tiktok: 5, youtube: 2, texting: 2.5, instagram: 1.5, snack: 1 }[k] || 0.4)),
    startW: [0.5, 1.4, 1.2, 1.1],
    perDay: 1.9,
  });
  return simulate(st, r, { days: 42, end: SAMPLE_END });
}
