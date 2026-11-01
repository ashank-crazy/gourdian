// Validation study: run Gourdian's analytics on synthetic students whose true behavior is known, and
// check every estimate against that ground truth. Deterministic: same seeds, same numbers.
//
//   node analysis/validate.mjs            full study (about 10 seconds)
//   node analysis/validate.mjs --quick    40 students, for a smoke test
//
// The full run writes analysis/results.json and analysis/RESULTS.md.

import { writeFileSync } from 'node:fs';
import {
  usable, periods, fitHazard, hazard, evaluate, survival, survivalAt, recommend, hourly, nudgeEffect,
  auc, logLoss, PRIOR, FEATURES, STEP,
} from '../js/insights.js';
import { rng, makeStudent, simulate } from '../js/simulate.js';

const QUICK = process.argv.includes('--quick');
const N = QUICK ? 40 : 200;
const DAYS = 42;                         // six weeks of history per student
const TRUTH_DAYS = QUICK ? 300 : 1000;   // long run used as "truth" for survival and hourly rates
const END = new Date(2026, 10, 1).getTime();
const t0 = performance.now();

// ---------- helpers ----------

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => Math.sqrt(a.reduce((s, v) => s + (v - mean(a)) ** 2, 0) / (a.length - 1));
const ci = a => { const m = mean(a), h = 1.96 * sd(a) / Math.sqrt(a.length); return { mean: m, lo: m - h, hi: m + h, n: a.length }; };
const f = (x, d = 3) => (x == null || Number.isNaN(x) ? '–' : x.toFixed(d));
const fci = (c, d = 3) => `${f(c.mean, d)} (${f(c.lo, d)} to ${f(c.hi, d)})`;
const pctf = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

// The prior is a guess. Scenario B draws students around different "true" population effects, to test
// whether personal data corrects a wrong prior.
const SCENARIOS = {
  A: { name: 'Prior roughly right', center: PRIOR.mean },
  B: { name: 'Prior wrong', center: [-3.4, 0.05, 1.2, 0.3, -0.2, -0.1, 0.0, 0.25] },
};

function student(i, scenario, extra = {}) {
  const r = rng(10007 * (i + 1) + (scenario === 'B' ? 7 : 0));
  return { st: makeStudent(r, { center: SCENARIOS[scenario].center, ...extra }), r };
}

// ---------- 1. Does the risk model predict held-out minutes? ----------

function predictive(scenario) {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const { st, r } = student(i, scenario);
    const sessions = simulate(st, r, { days: DAYS, end: END });
    const ev = evaluate(sessions);
    if (!ev) continue;
    // Oracle: the true coefficients, scored on the same held-out minutes (the best any model could do).
    const list = usable(sessions).sort((a, b) => a.startedAt - b.startedAt);
    const test = list.slice(Math.floor(list.length * 0.7)).flatMap(periods);
    const ys = test.map(x => x.y), oracle = test.map(x => hazard({ beta: st.beta }, x.x));
    rows.push({ ...ev, aucOracle: auc(oracle, ys), logLossOracle: logLoss(oracle, ys) });
  }
  const pick = k => ci(rows.map(x => x[k]));
  return {
    students: rows.length,
    auc: pick('auc'), aucPrior: pick('aucPrior'), aucOracle: pick('aucOracle'),
    logLoss: pick('logLoss'), logLossPrior: pick('logLossPrior'), logLossBase: pick('logLossBase'), logLossOracle: pick('logLossOracle'),
    skill: pick('skill'),
    beatsPrior: rows.filter(x => x.logLoss < x.logLossPrior).length / rows.length,
    beatsBase: rows.filter(x => x.logLoss < x.logLossBase).length / rows.length,
    calibration: pooledCalibration(rows),
  };
}

function pooledCalibration(rows) {
  // Average each student's 5 calibration bins (bins are quintiles of that student's predictions).
  return [0, 1, 2, 3, 4].map(b => {
    const pts = rows.map(r => r.calibration[b]).filter(Boolean);
    return { predicted: mean(pts.map(p => p.predicted)), observed: mean(pts.map(p => p.observed)) };
  });
}

// ---------- 2. Learning curve: how fast does personal data pay off? ----------

function learningCurve(scenario, sizes = [0, 5, 10, 20, 40, 80]) {
  const out = sizes.map(n => ({ n, auc: [], logLoss: [] }));
  const oracleLL = [];
  for (let i = 0; i < N; i++) {
    const { st, r } = student(i, scenario);
    const sessions = usable(simulate(st, r, { days: 70, end: END })).sort((a, b) => a.startedAt - b.startedAt);
    if (sessions.length < 100) continue;
    const test = sessions.slice(-20).flatMap(periods), ys = test.map(x => x.y);
    if (!ys.some(Boolean)) continue;
    oracleLL.push(logLoss(test.map(x => hazard({ beta: st.beta }, x.x)), ys));
    for (const o of out) {
      const train = sessions.slice(-20 - o.n, -20).flatMap(periods);
      const m = fitHazard(o.n ? train : []);
      const pred = test.map(x => hazard(m, x.x));
      o.auc.push(auc(pred, ys));
      o.logLoss.push(logLoss(pred, ys));
    }
  }
  return { points: out.map(o => ({ sessions: o.n, auc: ci(o.auc), logLoss: ci(o.logLoss) })), oracleLogLoss: ci(oracleLL) };
}

// ---------- 3. Are the coefficient intervals honest? ----------

function coefficients(scenario) {
  const err = FEATURES.map(() => []), cover = FEATURES.map(() => 0);
  let n = 0;
  for (let i = 0; i < N; i++) {
    const { st, r } = student(i, scenario);
    const m = fitHazard(usable(simulate(st, r, { days: DAYS, end: END })).flatMap(periods));
    n++;
    FEATURES.forEach((_, j) => {
      err[j].push(m.beta[j] - st.beta[j]);
      if (Math.abs(m.beta[j] - st.beta[j]) <= 1.96 * m.se[j]) cover[j]++;
    });
  }
  return FEATURES.map((ft, j) => ({ key: ft.key, label: ft.label, bias: mean(err[j]), rmse: Math.sqrt(mean(err[j].map(e => e * e))), coverage: cover[j] / n }));
}

// ---------- 4. Survival curves and hourly rates vs. long-run truth ----------

function descriptive() {
  const ts = [10, 15, 20], km = ts.map(() => ({ err: [], covered: 0, n: 0 }));
  const hours = { raw: [], shrunk: [] }, recs = [];
  for (let i = 0; i < N; i++) {
    const { st, r } = student(i, 'A');
    const short = simulate(st, r, { days: DAYS, end: END });
    const long = simulate(st, rng(900001 + i), { days: TRUTH_DAYS, end: END });
    const est = survival(short), truth = survival(long);
    ts.forEach((t, k) => {
      const e = survivalAt(est, t), tr = survivalAt(truth, t);
      if (!e || !tr || e.n < 5) return;
      km[k].n++;
      km[k].err.push(e.s - tr.s);
      if (tr.s >= e.lo && tr.s <= e.hi) km[k].covered++;
    });
    const rec = recommend(est), recTrue = recommend(truth);
    if (rec && recTrue) recs.push(rec.minutes - recTrue.minutes);
    // Hourly: squared error of raw and shrunk rates against the long-run rate, hours with any short-run data.
    const hs = hourly(short), ht = hourly(long);
    hs.hours.forEach((h, k) => {
      if (!h.exposure || ht.hours[k].exposure < 5) return;
      hours.raw.push((h.raw - ht.hours[k].raw) ** 2);
      hours.shrunk.push((h.rate - ht.hours[k].raw) ** 2);
    });
  }
  return {
    km: ts.map((t, k) => ({ t, n: km[k].n, bias: mean(km[k].err), mae: mean(km[k].err.map(Math.abs)), coverage: km[k].covered / km[k].n })),
    recommendation: { n: recs.length, exact: recs.filter(d => d === 0).length / recs.length, within5: recs.filter(d => Math.abs(d) <= 5).length / recs.length },
    hourly: { cells: hours.raw.length, mseRaw: mean(hours.raw), mseShrunk: mean(hours.shrunk), reduction: 1 - mean(hours.shrunk) / mean(hours.raw) },
  };
}

// ---------- 5. Does matching session length to the survival curve help? (simulated policy) ----------

function policy() {
  const out = { fixed: [], matched: [], cleanFixed: [], cleanMatched: [], minutes: [] };
  for (let i = 0; i < N; i++) {
    const { st, r } = student(i, 'A');
    const rec = recommend(survival(simulate(st, r, { days: DAYS, end: END })));
    if (!rec) continue;
    const run = L => {
      // Same seed for both arms (common random numbers), so the comparison isn't drowned in noise.
      const s = usable(simulate({ ...st, lengths: [L], lengthW: [1] }, rng(500009 + i), { days: 28, end: END + 28 * 86400000 }));
      const rows = s.flatMap(periods), slips = rows.filter(x => x.y).length;
      return { rate: slips / (rows.length / 60), clean: s.filter(x => !x.away.some(e => e.c !== 'work')).length / s.length };
    };
    const a = run(25), b = run(rec.minutes);
    out.fixed.push(a.rate); out.matched.push(b.rate);
    out.cleanFixed.push(a.clean); out.cleanMatched.push(b.clean);
    out.minutes.push(rec.minutes);
  }
  const rel = out.matched.map((m, i) => m / out.fixed[i] - 1);
  return {
    students: out.fixed.length,
    slipRateFixed: ci(out.fixed), slipRateMatched: ci(out.matched), relativeChange: ci(rel),
    cleanFixed: ci(out.cleanFixed), cleanMatched: ci(out.cleanMatched),
    recommended: Object.fromEntries([10, 15, 20, 25, 30, 35, 40, 45, 50].map(m => [m, out.minutes.filter(x => x === m).length]).filter(([, c]) => c)),
  };
}

// ---------- 6. Micro-randomized trial: does the estimator find a real effect, and only a real one? ----------

function trial(effect) {
  const all = [];
  for (let i = 0; i < N; i++) {
    const { st, r } = student(i, 'A', { nudgeEffect: effect });
    all.push(...simulate(st, r, { days: DAYS, end: END }));
  }
  return nudgeEffect(all);
}

// ---------- run ----------

const results = {
  config: { students: N, days: DAYS, truthDays: TRUTH_DAYS, prior: PRIOR, scenarios: SCENARIOS, step: STEP },
  predictive: { A: predictive('A'), B: predictive('B') },
  learning: { B: learningCurve('B') },
  coefficients: { A: coefficients('A'), B: coefficients('B') },
  descriptive: descriptive(),
  policy: policy(),
  trial: { real: trial(-0.4), null: trial(0) },
};
results.seconds = Math.round((performance.now() - t0) / 100) / 10;
// A --quick run is a smoke test; only the full study gets written down.
if (!QUICK) writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(results, null, 2));

// ---------- report ----------

const P = results.predictive, D = results.descriptive, Pol = results.policy, T = results.trial;
const md = `# Validation results

Generated by \`node analysis/validate.mjs\` in ${results.seconds} s. Every number below comes from
**synthetic** students simulated by \`js/simulate.js\`, where the true behavior is known. These results
show the methods work as intended on data that follows the model's assumptions. They are not evidence
about real students; that needs a pilot (see the DataNova write-up).

Setup: ${N} students per scenario, ${DAYS} days of history each (about ${Math.round(DAYS * 1.4)} sessions),
each with personal hazard coefficients drawn around a population mean (SD 0.35 on the log-odds scale).
Scenario A draws them around the app's starter prior. Scenario B draws them around a different "truth"
(no time-on-task effect, no night effect, a bigger relapse effect), so the prior is wrong.

## 1. Predicting slips on held-out sessions

Chronological split per student: fit on the oldest 70% of sessions, score every watched minute of the
newest 30%. Means across students with 95% confidence intervals.

| Metric | Scenario A (prior roughly right) | Scenario B (prior wrong) |
| --- | --- | --- |
| AUC, personal model | ${fci(P.A.auc)} | ${fci(P.B.auc)} |
| AUC, starter prior only | ${fci(P.A.aucPrior)} | ${fci(P.B.aucPrior)} |
| AUC, true coefficients (ceiling) | ${fci(P.A.aucOracle)} | ${fci(P.B.aucOracle)} |
| Log loss, personal model | ${fci(P.A.logLoss, 4)} | ${fci(P.B.logLoss, 4)} |
| Log loss, starter prior only | ${fci(P.A.logLossPrior, 4)} | ${fci(P.B.logLossPrior, 4)} |
| Log loss, constant rate | ${fci(P.A.logLossBase, 4)} | ${fci(P.B.logLossBase, 4)} |
| Log loss, true coefficients (floor) | ${fci(P.A.logLossOracle, 4)} | ${fci(P.B.logLossOracle, 4)} |
| Brier skill vs. constant rate | ${fci(P.A.skill)} | ${fci(P.B.skill)} |
| Students where personal beats prior (log loss) | ${pctf(P.A.beatsPrior, 0)} | ${pctf(P.B.beatsPrior, 0)} |
| Students where personal beats constant rate | ${pctf(P.A.beatsBase, 0)} | ${pctf(P.B.beatsBase, 0)} |

Pooled calibration, scenario A (mean predicted vs. observed slip rate per minute, by quintile):
${P.A.calibration.map(c => `${pctf(c.predicted)} → ${pctf(c.observed)}`).join(' · ')}

## 2. Learning curve (scenario B, prior wrong)

Same 20 held-out sessions per student; the model is trained on the N sessions just before them.

| Training sessions | AUC | Log loss |
| --- | --- | --- |
${results.learning.B.points.map(p => `| ${p.sessions === 0 ? '0 (prior only)' : p.sessions} | ${fci(p.auc)} | ${fci(p.logLoss, 4)} |`).join('\n')}
| True coefficients | | ${fci(results.learning.B.oracleLogLoss, 4)} |

## 3. Coefficient recovery from six weeks of data

Bias and RMSE of each estimated log-odds coefficient, and how often its 95% interval contains the truth.

| Coefficient | A: bias | A: RMSE | A: 95% coverage | B: bias | B: RMSE | B: 95% coverage |
| --- | --- | --- | --- | --- | --- | --- |
${results.coefficients.A.map((c, j) => { const b = results.coefficients.B[j]; return `| ${c.label} | ${f(c.bias)} | ${f(c.rmse)} | ${pctf(c.coverage, 0)} | ${f(b.bias)} | ${f(b.rmse)} | ${pctf(b.coverage, 0)} |`; }).join('\n')}

## 4. Survival curves, recommendations and hourly rates

Each student's six-week Kaplan–Meier estimate against the same student's ${TRUTH_DAYS}-day long run.

| Minute | Students | Mean error | Mean abs. error | 95% band contains truth |
| --- | --- | --- | --- | --- |
${D.km.map(k => `| ${k.t} | ${k.n} | ${f(k.bias)} | ${f(k.mae)} | ${pctf(k.coverage, 0)} |`).join('\n')}

Recommended session length vs. the one the long run would give: identical for ${pctf(D.recommendation.exact, 0)} of
students, within 5 minutes for ${pctf(D.recommendation.within5, 0)} (n = ${D.recommendation.n}).

Hourly slip rates (${D.hourly.cells} student-hours): mean squared error ${f(D.hourly.mseRaw, 2)} for raw rates,
${f(D.hourly.mseShrunk, 2)} with empirical-Bayes shrinkage, a **${pctf(D.hourly.reduction, 0)} reduction**.

## 5. Policy simulation: fixed 25-minute sessions vs. the recommended length

${Pol.students} students, four further weeks simulated twice with the same random numbers: once with every
session at 25 minutes, once at each student's recommended length (${Object.entries(Pol.recommended).map(([m, c]) => `${m} min: ${c}`).join(', ')}).

| | Fixed 25 min | Recommended length |
| --- | --- | --- |
| Slips per focus hour | ${fci(Pol.slipRateFixed, 2)} | ${fci(Pol.slipRateMatched, 2)} |
| Slip-free sessions | ${fci(Pol.cleanFixed, 2)} | ${fci(Pol.cleanMatched, 2)} |

Relative change in slips per focus hour: ${fci(Pol.relativeChange)}. This follows from the time-on-task effect
built into the simulator, so it shows the recommendation does what it should *if* that effect is real. Shorter
sessions also mean less focus time per session unless students run more of them.

## 6. Micro-randomized warnings

All ${N} scenario-A students pooled. At each high-risk moment Jack warns with probability 1/2.

| True effect of a warning | Warned: slipped within 5 min | Not warned | Estimated difference (95% CI) |
| --- | --- | --- | --- |
| −0.4 log-odds for 5 min | ${pctf(T.real.ps)} of ${T.real.sent.n} | ${pctf(T.real.ph)} of ${T.real.held.n} | ${f(T.real.diff * 100, 1)} pts (${f(T.real.lo * 100, 1)} to ${f(T.real.hi * 100, 1)}) |
| None (A/A check) | ${pctf(T.null.ps)} of ${T.null.sent.n} | ${pctf(T.null.ph)} of ${T.null.held.n} | ${f(T.null.diff * 100, 1)} pts (${f(T.null.lo * 100, 1)} to ${f(T.null.hi * 100, 1)}) |
`;
if (!QUICK) writeFileSync(new URL('./RESULTS.md', import.meta.url), md);
console.log(md);
