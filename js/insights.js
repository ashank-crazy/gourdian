// Focus analytics: survival curves, slip rates by hour, and a small on-device risk model.
// Pure functions over the session log, so the page, the sample student, and the Node validation
// in analysis/ all run exactly the same code. Nothing here touches the DOM or the network.
//
// Vocabulary: a "slip" is an unexcused trip away from the tab (any confession except "working in
// another tab"). Times inside a session are seconds since it started, pauses excluded.

export const STEP = 60; // seconds per model time step

// Discrete-time hazard model: P(slip during this minute | still here at its start) = sigmoid(beta · x).
export const FEATURES = [
  { key: 'bias', label: 'Baseline (minute 0, afternoon)' },
  { key: 'm10', label: 'Every 10 min into a session' },
  { key: 'slipped', label: 'Already slipped this session' },
  { key: 'morning', label: 'Morning (5 am–noon)' },
  { key: 'evening', label: 'Evening (5–10 pm)' },
  { key: 'night', label: 'Late night (10 pm–5 am)' },
  { key: 'weekend', label: 'Weekend' },
  { key: 'long', label: 'Each +25 min of planned length' },
];

// Starter prior. Hand-set, not fitted to anyone: a ~2%/min base rate, and effect directions taken from
// attention research (vigilance drops with time on task; self-control is worse late at night).
// Personal data moves the estimates away from it as it accumulates (MAP estimation, Gaussian prior).
export const PRIOR = {
  mean: [-3.9, 0.25, 0.6, -0.3, 0.2, 0.5, 0.2, 0],
  sd: [1.5, 0.5, 0.7, 0.7, 0.7, 0.7, 0.7, 0.5],
};

// Warning policy: when the 5-minute slip risk reaches `risk`, Jack warns with probability `p`
// (the other half are logged as withheld, so the effect of warnings can be measured), then waits
// `cooldownMin` minutes before deciding again.
export const NUDGE = { risk: 0.3, p: 0.5, cooldownMin: 8, horizonMin: 5 };

export const daypart = h => (h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night');
const isWeekend = d => d.getDay() === 0 || d.getDay() === 6;

export function features({ minute, slipped, hour, weekend, plannedMin }) {
  const dp = daypart(hour);
  return [1, minute / 10, slipped ? 1 : 0, +(dp === 'morning'), +(dp === 'evening'), +(dp === 'night'), weekend ? 1 : 0, (plannedMin - 25) / 25];
}

// ---------- small numeric helpers ----------

const sum = a => a.reduce((s, v) => s + v, 0);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const sigmoid = z => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Solve A x = b by Gaussian elimination with partial pivoting (A is small and symmetric positive definite).
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) x[r] = (M[r][n] - dot(M[r].slice(r + 1, n), x.slice(r + 1))) / M[r][r];
  return x;
}
function invert(A) {
  const cols = A.map((_, j) => solve(A, A.map((__, i) => +(i === j))));
  return A.map((_, i) => cols.map(c => c[i]));
}

// ---------- the session log ----------

// Sessions logged before per-trip timing existed have no `away` list and are skipped by the models.
export const usable = list => list.filter(s => Array.isArray(s.away) && s.startedAt && s.elapsedSec >= STEP);
const isSlip = e => e.c !== 'work';
const slipTimes = s => s.away.filter(isSlip).map(e => e.t).sort((a, b) => a - b);

// One row per minute that Jack was watching: features, and whether a slip started in that minute.
// Minutes spent entirely away are not at risk, so they produce no row.
export function periods(s) {
  const rows = [], away = s.away.map(e => [e.t, e.t + e.d]), slips = slipTimes(s);
  const plannedMin = s.plannedSec / 60;
  for (let k = 0; k < Math.ceil(s.elapsedSec / STEP); k++) {
    const a = k * STEP, b = Math.min(s.elapsedSec, a + STEP);
    const y = slips.some(t => t >= a && t < b) ? 1 : 0;
    if (!y && away.some(([t0, t1]) => t0 <= a && t1 >= b)) continue;
    const wall = new Date(s.startedAt + a * 1000);
    const x = features({ minute: k, slipped: slips.some(t => t < a), hour: wall.getHours(), weekend: isWeekend(wall), plannedMin });
    rows.push({ hour: wall.getHours(), y, x });
  }
  return rows;
}

// ---------- survival: how long until the first slip ----------

// Kaplan–Meier estimator with Greenwood variance and a log(-log) 95% interval.
// obs: [{ t, e }] where e = 1 for an observed slip at t, 0 for a session that ended slip-free at t.
export function kaplanMeier(obs) {
  const times = [...new Set(obs.filter(o => o.e).map(o => o.t))].sort((a, b) => a - b);
  const points = [{ t: 0, s: 1, lo: 1, hi: 1, n: obs.length, d: 0, se: 0 }];
  let s = 1, gw = 0;
  for (const t of times) {
    const n = obs.filter(o => o.t >= t).length, d = obs.filter(o => o.e && o.t === t).length;
    s *= 1 - d / n;
    gw += n > d ? d / (n * (n - d)) : Infinity;
    let lo = s, hi = s;
    if (s > 0 && s < 1 && Number.isFinite(gw)) {
      const k = 1.96 * Math.sqrt(gw) / Math.abs(Math.log(s));
      lo = s ** Math.exp(k);
      hi = s ** Math.exp(-k);
    }
    points.push({ t, s, lo, hi, n, d, se: Number.isFinite(gw) ? s * Math.sqrt(gw) : 0 });
  }
  return { points, n: obs.length, events: obs.filter(o => o.e).length, maxT: Math.max(0, ...obs.map(o => o.t)) };
}

export function survival(sessions) {
  return kaplanMeier(usable(sessions).map(s => {
    const first = slipTimes(s)[0];
    return first != null ? { t: first / 60, e: 1 } : { t: s.elapsedSec / 60, e: 0 };
  }));
}

// S(t), or null past the longest observation (the estimate says nothing there).
export function survivalAt(km, t) {
  if (t > km.maxT) return null;
  let p = km.points[0];
  for (const q of km.points) if (q.t <= t) p = q;
  return p;
}

// Session length that keeps the chance of a slip-free session at or above `target`.
export function recommend(km, { target = 0.7, min = 10, max = 50, minSessions = 5 } = {}) {
  if (km.n < minSessions) return null;
  const drop = km.points.find(p => p.s < target);
  const raw = drop ? drop.t : km.maxT;
  return { minutes: Math.min(max, Math.max(min, Math.round(raw / 5) * 5)), raw, capped: !drop, target };
}

// ---------- when: slip rate by hour of day ----------

// Slips per focus hour for each clock hour. Raw rates from a few minutes of data are noise, so each hour
// is shrunk toward the overall rate (Gamma–Poisson empirical Bayes, prior worth `priorHours` of focus).
export function hourly(sessions, { priorHours = 1 } = {}) {
  const ev = Array(24).fill(0), ex = Array(24).fill(0);
  for (const s of usable(sessions)) for (const r of periods(s)) { ex[r.hour] += STEP / 3600; ev[r.hour] += r.y; }
  const E = sum(ev), X = sum(ex), g = X ? E / X : 0;
  return {
    global: g, events: E, exposure: X,
    hours: ev.map((e, h) => ({ hour: h, events: e, exposure: ex[h], raw: ex[h] ? e / ex[h] : null, rate: ex[h] ? (e + g * priorHours) / (ex[h] + priorHours) : null })),
  };
}

// The same counts pooled into four parts of the day, which have enough data to compare directly.
export const DAYPARTS = [
  { key: 'morning', label: 'mornings' },
  { key: 'afternoon', label: 'afternoons' },
  { key: 'evening', label: 'evenings' },
  { key: 'night', label: 'late nights' },
];
export function dayparts(hr) {
  return DAYPARTS.map(d => {
    const hs = hr.hours.filter(h => daypart(h.hour) === d.key);
    const events = sum(hs.map(h => h.events)), exposure = sum(hs.map(h => h.exposure));
    return { ...d, events, exposure, rate: exposure ? events / exposure : null };
  });
}

// ---------- what: cost of each distraction ----------

export function culpritStats(sessions) {
  const by = {};
  for (const s of usable(sessions)) for (const e of s.away) (by[e.c] ||= []).push(e.d);
  return Object.entries(by).map(([c, ds]) => {
    ds.sort((a, b) => a - b);
    return { c, count: ds.length, total: sum(ds), median: quantile(ds, 0.5), p90: quantile(ds, 0.9) };
  }).sort((a, b) => b.total - a.total);
}

// ---------- the risk model ----------

// MAP logistic regression by Newton's method with a backtracking line search (plain Newton can
// overshoot and diverge when the data sit far from the prior). `strength` scales the prior precision
// (0 = plain maximum likelihood).
export function fitHazard(rows, { prior = PRIOR, strength = 1 } = {}) {
  const p = prior.mean.length, prec = prior.sd.map(sd => strength / (sd * sd));
  let beta = prior.mean.slice(), iters = 0;
  // Negative log posterior, up to a constant.
  const loss = b => rows.reduce((v, { x, y }) => {
    const z = dot(b, x);
    return v + (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z))) - y * z;
  }, b.reduce((v, bj, j) => v + 0.5 * prec[j] * (bj - prior.mean[j]) ** 2, 0));
  const hessian = () => {
    const M = prec.map((v, i) => prec.map((_, j) => (i === j ? v + 1e-9 : 0)));
    const g = beta.map((b, j) => prec[j] * (b - prior.mean[j]));
    for (const { x, y } of rows) {
      const mu = sigmoid(dot(beta, x)), w = mu * (1 - mu);
      for (let i = 0; i < p; i++) {
        if (!x[i]) continue;
        g[i] += (mu - y) * x[i];
        for (let j = 0; j < p; j++) M[i][j] += w * x[i] * x[j];
      }
    }
    return [M, g];
  };
  for (let cur = loss(beta); iters < 50; iters++) {
    const [M, g] = hessian(), step = solve(M, g), slope = dot(g, step);
    let t = 1, next = beta.map((b, j) => b - step[j]), val = loss(next);
    while (val > cur - 1e-4 * t * slope && t > 1e-6) {
      t /= 2;
      next = beta.map((b, j) => b - t * step[j]);
      val = loss(next);
    }
    beta = next;
    if (t * Math.max(...step.map(Math.abs)) < 1e-8 || cur - val < 1e-12) break;
    cur = val;
  }
  const cov = invert(hessian()[0]);
  return { beta, se: cov.map((r, i) => Math.sqrt(Math.max(0, r[i]))), n: rows.length, events: rows.filter(r => r.y).length, iters, strength };
}

export const starterModel = () => ({ beta: PRIOR.mean.slice(), se: PRIOR.sd.slice(), n: 0, events: 0, iters: 0, strength: 1 });
export const hazard = (model, x) => sigmoid(dot(model.beta, x));

// Chance of a slip within the next `horizon` minutes, if nothing changes. ctx.at is the wall clock now.
export function riskAhead(model, { minute, slipped, plannedMin, at }, horizon = 5) {
  let stay = 1;
  for (let k = 0; k < horizon; k++) {
    const wall = new Date(at + k * 60000);
    stay *= 1 - hazard(model, features({ minute: minute + k, slipped, hour: wall.getHours(), weekend: isWeekend(wall), plannedMin }));
  }
  return 1 - stay;
}

// Odds ratio per feature with a 95% interval from the Laplace approximation to the posterior.
export const effects = model => FEATURES.slice(1).map((f, i) => {
  const b = model.beta[i + 1], se = model.se[i + 1];
  return { ...f, or: Math.exp(b), lo: Math.exp(b - 1.96 * se), hi: Math.exp(b + 1.96 * se) };
});

// ---------- model checks ----------

// Area under the ROC curve via the rank-sum (Mann–Whitney) statistic, ties averaged.
export function auc(pred, ys) {
  const idx = pred.map((p, i) => i).sort((a, b) => pred[a] - pred[b]);
  const ranks = Array(pred.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && pred[idx[j + 1]] === pred[idx[i]]) j++;
    for (let k = i; k <= j; k++) ranks[idx[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  const pos = ys.filter(Boolean).length, neg = ys.length - pos;
  if (!pos || !neg) return null;
  return (sum(ranks.filter((_, i) => ys[i])) - (pos * (pos + 1)) / 2) / (pos * neg);
}

export const brier = (pred, ys) => sum(pred.map((p, i) => (p - ys[i]) ** 2)) / pred.length;
export const logLoss = (pred, ys) => -sum(pred.map((p, i) => Math.log(Math.min(1 - 1e-12, Math.max(1e-12, ys[i] ? p : 1 - p))))) / pred.length;

export function calibration(pred, ys, bins = 5) {
  const order = pred.map((p, i) => i).sort((a, b) => pred[a] - pred[b]);
  return Array.from({ length: bins }, (_, b) => {
    const part = order.slice(Math.floor((b * order.length) / bins), Math.floor(((b + 1) * order.length) / bins));
    return part.length ? { predicted: sum(part.map(i => pred[i])) / part.length, observed: sum(part.map(i => ys[i])) / part.length, n: part.length } : null;
  }).filter(Boolean);
}

// Chronological holdout: fit on the oldest 70% of sessions, score the newest 30% minute by minute.
// Compared against a constant-rate baseline and against the starter prior with no personal data.
export function evaluate(sessions, opts = {}) {
  const list = usable(sessions).sort((a, b) => a.startedAt - b.startedAt);
  const cut = Math.floor(list.length * 0.7);
  if (cut < 5 || list.length - cut < 2) return null;
  const train = list.slice(0, cut).flatMap(periods), test = list.slice(cut).flatMap(periods);
  const ys = test.map(r => r.y), events = sum(ys);
  if (!events || events === ys.length) return null;
  const model = fitHazard(train, opts), base = sum(train.map(r => r.y)) / train.length;
  const pred = test.map(r => hazard(model, r.x)), prior = test.map(r => hazard(starterModel(), r.x)), flat = test.map(() => base);
  const b = brier(pred, ys), b0 = brier(flat, ys);
  return {
    trainSessions: cut, testSessions: list.length - cut, testMinutes: test.length, testEvents: events,
    auc: auc(pred, ys), aucPrior: auc(prior, ys),
    brier: b, brierBase: b0, skill: 1 - b / b0,
    logLoss: logLoss(pred, ys), logLossBase: logLoss(flat, ys), logLossPrior: logLoss(prior, ys),
    calibration: calibration(pred, ys),
  };
}

// ---------- do Jack's warnings work? ----------

// When the model sees a high-risk moment, Jack warns with probability 1/2 (a micro-randomized trial).
// Comparing what happened in the next 5 minutes after sent vs. withheld warnings estimates their effect.
export function nudgeEffect(sessions, horizonMin = 5) {
  const arms = { sent: { n: 0, slips: 0 }, held: { n: 0, slips: 0 } };
  for (const s of usable(sessions)) for (const d of s.nudges || []) {
    const from = d.m * 60, to = Math.min(s.elapsedSec, from + horizonMin * 60);
    if (to - from < 60) continue;
    const arm = arms[d.sent ? 'sent' : 'held'];
    arm.n++;
    arm.slips += slipTimes(s).some(t => t >= from && t < to) ? 1 : 0;
  }
  const rate = a => (a.n ? a.slips / a.n : null);
  const ps = rate(arms.sent), ph = rate(arms.held);
  if (ps == null || ph == null) return { ...arms, diff: null };
  const se = Math.sqrt((ps * (1 - ps)) / arms.sent.n + (ph * (1 - ph)) / arms.held.n);
  return { ...arms, ps, ph, diff: ps - ph, lo: ps - ph - 1.96 * se, hi: ps - ph + 1.96 * se };
}

// ---------- everything the Insights page shows ----------

export function analyze(sessions) {
  const list = usable(sessions);
  const rows = list.flatMap(periods);
  const km = survival(list), hr = hourly(list);
  const model = rows.length ? fitHazard(rows) : starterModel();
  const focusMin = rows.length, slips = sum(rows.map(r => r.y));
  return {
    sessions: list.length, focusMin, slips,
    slipsPerHour: focusMin ? slips / (focusMin / 60) : null,
    cleanRate: list.length ? list.filter(s => !slipTimes(s).length).length / list.length : null,
    km, rec: recommend(km), hourly: hr, dayparts: dayparts(hr), culprits: culpritStats(list),
    model, effects: effects(model), check: evaluate(list), nudges: nudgeEffect(list),
  };
}

// ---------- export ----------

// Flat tables for the CSV downloads (and data/ in the repo). Sessions are numbered oldest first.
export function sessionTable(sessions) {
  const list = usable(sessions).sort((a, b) => a.startedAt - b.startedAt);
  const iso = ts => new Date(ts).toISOString();
  return {
    sessions: [
      ['session_id', 'started_at', 'ended_at', 'weekday', 'start_hour', 'planned_min', 'elapsed_sec', 'unexcused_sec', 'trips', 'slips', 'first_slip_sec', 'peeks', 'warnings_sent', 'warnings_withheld', 'top_culprit', 'grade', 'outcome', 'task'],
      ...list.map((s, i) => {
        const slips = slipTimes(s), d = new Date(s.startedAt), nudges = s.nudges || [];
        return [i + 1, iso(s.startedAt), iso(s.at), d.getDay(), d.getHours(), s.plannedSec / 60, s.elapsedSec, s.unexcusedSec, s.away.length, slips.length,
          slips[0] ?? '', s.peeks ?? 0, nudges.filter(n => n.sent).length, nudges.filter(n => !n.sent).length,
          s.top, s.grade, s.died ? 'died' : s.abandoned ? 'abandoned' : 'finished', s.task];
      }),
    ],
    trips: [
      ['session_id', 'left_at', 'left_at_sec', 'duration_sec', 'culprit', 'excused'],
      ...list.flatMap((s, i) => s.away.map(e => [i + 1, iso(s.startedAt + e.t * 1000), e.t, e.d, e.c, e.c === 'work' ? 1 : 0])),
    ],
    warnings: [
      ['session_id', 'minute', 'risk', 'sent'],
      ...list.flatMap((s, i) => (s.nudges || []).map(n => [i + 1, n.m, n.r, n.sent ? 1 : 0])),
    ],
  };
}

const csvCell = v => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export const toCSV = rows => `${rows.map(r => r.map(csvCell).join(',')).join('\n')}\n`;

