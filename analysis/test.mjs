// Unit tests for js/insights.js and js/simulate.js. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kaplanMeier, survivalAt, recommend, periods, fitHazard, hazard, riskAhead, auc, brier, calibration,
  hourly, nudgeEffect, features, sigmoid, starterModel, evaluate, analyze, PRIOR,
} from '../js/insights.js';
import { rng, makeStudent, simulate, sampleSessions } from '../js/simulate.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);

test('Kaplan–Meier matches the textbook 6-MP leukemia example (Freireich 1963)', () => {
  const events = [6, 6, 6, 7, 10, 13, 16, 22, 23];
  const censored = [6, 9, 10, 11, 17, 19, 20, 25, 32, 32, 34, 35];
  const km = kaplanMeier([...events.map(t => ({ t, e: 1 })), ...censored.map(t => ({ t, e: 0 }))]);
  const expect = { 6: 0.857, 7: 0.807, 10: 0.753, 13: 0.69, 16: 0.627, 22: 0.538, 23: 0.448 };
  for (const [t, s] of Object.entries(expect)) close(survivalAt(km, +t).s, s, 0.001, `S(${t})`);
  close(survivalAt(km, 6).se, 0.0764, 0.0005, 'Greenwood SE at 6');
  assert.equal(km.n, 21);
  assert.equal(km.events, 9);
  assert.equal(survivalAt(km, 40), null, 'no estimate past the last observation');
  const p = survivalAt(km, 13);
  assert.ok(p.lo < p.s && p.s < p.hi, 'interval brackets the estimate');
});

test('recommend rounds to 5 minutes, clamps, and waits for enough sessions', () => {
  const km = kaplanMeier([3, 13, 14, 20, 30].map(t => ({ t, e: 1 })).concat([{ t: 40, e: 0 }]));
  // S drops 1 -> .83 at 3, -> .67 at 13: first point under 70% is t = 13 -> 15 min
  assert.equal(recommend(km).minutes, 15);
  assert.equal(recommend(kaplanMeier([{ t: 2, e: 1 }, { t: 2.5, e: 1 }, { t: 3, e: 1 }, { t: 4, e: 0 }, { t: 5, e: 0 }])).minutes, 10, 'clamped to 10');
  assert.equal(recommend(kaplanMeier([{ t: 5, e: 1 }])), null);
  const clean = recommend(kaplanMeier(Array.from({ length: 6 }, () => ({ t: 25, e: 0 }))));
  assert.equal(clean.minutes, 25);
  assert.equal(clean.capped, true);
});

test('periods: one row per watched minute, slips land in the right minute', () => {
  const s = {
    startedAt: new Date(2026, 9, 14, 15, 0).getTime(), plannedSec: 600, elapsedSec: 600,
    away: [{ t: 125, d: 200, c: 'tiktok' }, { t: 400, d: 30, c: 'work' }],
  };
  const rows = periods(s);
  // minutes 3 and 4 (180-300s) are fully inside the TikTok trip; the work trip covers no full minute
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map(r => r.y), [0, 0, 1, 0, 0, 0, 0, 0]);
  const after = rows[3];
  assert.equal(after.x[2], 1, 'slipped flag set after the first slip');
  assert.equal(rows[0].x[2], 0);
  assert.equal(after.x[1], 0.5, 'minute 5 / 10');
});

test('features encode the part of day and weekend', () => {
  assert.deepEqual(features({ minute: 20, slipped: true, hour: 23, weekend: true, plannedMin: 50 }), [1, 2, 1, 0, 0, 1, 1, 1]);
  assert.deepEqual(features({ minute: 0, slipped: false, hour: 14, weekend: false, plannedMin: 25 }), [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(features({ minute: 0, slipped: false, hour: 3, weekend: false, plannedMin: 25 }).slice(3, 6), [0, 0, 1]);
});

test('AUC, Brier and calibration on hand-checked values', () => {
  assert.equal(auc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1]), 0.75);
  assert.equal(auc([0.5, 0.5], [0, 1]), 0.5, 'ties count half');
  assert.equal(auc([0.2, 0.3], [0, 0]), null);
  close(brier([0.1, 0.9], [0, 1]), 0.01, 1e-12);
  const cal = calibration([0.1, 0.1, 0.9, 0.9], [0, 0, 1, 1], 2);
  assert.deepEqual(cal.map(c => [c.predicted, c.observed]), [[0.1, 0], [0.9, 1]]);
});

test('fitHazard recovers known coefficients from plenty of data (no prior)', () => {
  const r = rng(7), truth = [-3, 0.4, 0.8, -0.5, 0.3, 0.6, 0.2, 0.1];
  const rows = Array.from({ length: 60000 }, () => {
    const x = features({ minute: Math.floor(r() * 50), slipped: r() < 0.3, hour: Math.floor(r() * 24), weekend: r() < 0.3, plannedMin: [15, 25, 50][Math.floor(r() * 3)] });
    return { x, y: r() < sigmoid(x.reduce((s, v, i) => s + v * truth[i], 0)) ? 1 : 0 };
  });
  const m = fitHazard(rows, { strength: 0 });
  m.beta.forEach((b, i) => close(b, truth[i], 4 * m.se[i] + 0.02, `beta[${i}]`));
  assert.ok(m.iters < 15, 'Newton converges quickly');
});

test('with no data the fit is the prior; riskAhead compounds per-minute hazard', () => {
  const m = fitHazard([]);
  m.beta.forEach((b, i) => close(b, PRIOR.mean[i], 1e-9));
  const flat = { beta: [Math.log(0.05 / 0.95), 0, 0, 0, 0, 0, 0, 0] };
  close(riskAhead(flat, { minute: 3, slipped: false, plannedMin: 25, at: Date.now() }, 5), 1 - 0.95 ** 5, 1e-12);
  close(hazard(starterModel(), [1, 0, 0, 0, 0, 0, 0, 0]), sigmoid(PRIOR.mean[0]), 1e-12);
});

test('hourly rates shrink toward the overall rate', () => {
  const at = h => new Date(2026, 9, 14, h, 0).getTime();
  const sessions = [
    { startedAt: at(9), plannedSec: 3600, elapsedSec: 3600, away: [] },
    { startedAt: at(22), plannedSec: 600, elapsedSec: 600, away: [{ t: 30, d: 20, c: 'tiktok' }] },
  ];
  const hr = hourly(sessions, { priorHours: 1 });
  const total = 60 + 10; // watched minutes (the 20 s trip covers no full minute)
  close(hr.global, 1 / (total / 60), 1e-9);
  const h22 = hr.hours[22];
  close(h22.raw, 6, 1e-9, 'one slip in 10 minutes');
  close(h22.rate, (1 + hr.global) / (10 / 60 + 1), 1e-9);
  assert.ok(h22.rate < h22.raw && h22.rate > hr.global);
  assert.equal(hr.hours[3].rate, null);
});

test('nudgeEffect compares the two randomized arms', () => {
  const base = { startedAt: Date.now(), plannedSec: 1800, elapsedSec: 1800 };
  const sessions = [
    { ...base, away: [{ t: 700, d: 60, c: 'tiktok' }], nudges: [{ m: 10, sent: false }] },
    { ...base, away: [], nudges: [{ m: 10, sent: true }] },
    { ...base, away: [{ t: 2000, d: 60, c: 'tiktok' }], nudges: [{ m: 10, sent: true }] },
  ];
  const e = nudgeEffect(sessions);
  assert.deepEqual([e.sent.n, e.sent.slips, e.held.n, e.held.slips], [2, 0, 1, 1]);
  assert.equal(e.diff, -1);
});

test('the simulator is deterministic and emits valid session logs', () => {
  const a = simulate(makeStudent(rng(3)), rng(4), { days: 14, end: new Date(2026, 10, 1).getTime() });
  const b = simulate(makeStudent(rng(3)), rng(4), { days: 14, end: new Date(2026, 10, 1).getTime() });
  assert.deepEqual(a, b);
  assert.ok(a.length > 5);
  for (const s of a) {
    assert.ok(s.elapsedSec <= s.plannedSec);
    for (const e of s.away) {
      assert.ok(e.t >= 0 && e.d >= 10 && e.t + e.d <= s.plannedSec + 1, 'trip inside the session');
    }
    assert.equal(s.trips, s.away.length);
  }
  assert.ok(a[0].startedAt > a.at(-1).startedAt, 'newest first');
});

test('the sample student is stable and analyzable', () => {
  const s1 = sampleSessions(new Date(2026, 10, 2).getTime()), s2 = sampleSessions(new Date(2026, 10, 9, 12).getTime());
  assert.equal(s1.length, s2.length);
  const [d1, d2] = [new Date(s1[0].startedAt), new Date(s2[0].startedAt)];
  assert.deepEqual([d2.getDay(), d2.getHours(), d2.getMinutes()], [d1.getDay(), d1.getHours(), d1.getMinutes()], 'same weekday and clock time');
  assert.ok(d2 > d1, 'shifted forward');
  const a = analyze(s1);
  assert.ok(a.sessions > 40 && a.check && a.rec);
  assert.ok(evaluate(s1).auc > 0.5);
});
