// Small hand-drawn SVG charts for the Insights page. Each takes data plus the pixel width it will be
// shown at (so text stays at real size on phones) and returns markup. Colors live in styles.css.

const fmtPct = v => `${Math.round(v * 100)}%`;
const hourName = h => `${h % 12 || 12}${h < 12 ? ' am' : ' pm'}`;
const hourTick = h => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// A bar with 4px rounded ends at the data value and a flat end on the baseline.
function vbar(x, y0, w, y1, r = 4) {
  const h = y0 - y1;
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x} ${y0}V${y1 + r}Q${x} ${y1} ${x + r} ${y1}H${x + w - r}Q${x + w} ${y1} ${x + w} ${y1 + r}V${y0}Z`;
}
function hbar(x0, x1, y, h, r = 4) {
  const w = Math.abs(x1 - x0);
  if (w < 0.5) return '';
  r = Math.min(r, h / 2, w);
  return x1 > x0
    ? `M${x0} ${y}H${x1 - r}Q${x1} ${y} ${x1} ${y + r}V${y + h - r}Q${x1} ${y + h} ${x1 - r} ${y + h}H${x0}Z`
    : `M${x0} ${y}H${x1 + r}Q${x1} ${y} ${x1} ${y + r}V${y + h - r}Q${x1} ${y + h} ${x1 + r} ${y + h}H${x0}Z`;
}

// ---------- survival curve ----------

export function survivalChart(km, { width, rec = null, target = 0.7 }) {
  const W = Math.max(280, width), H = 230, m = { l: 40, r: 14, t: 14, b: 30 };
  const tMax = Math.max(10, Math.ceil(km.maxT / 5) * 5);
  const X = t => m.l + (t / tMax) * (W - m.l - m.r), Y = s => m.t + (1 - s) * (H - m.t - m.b);
  const pts = km.points, end = km.maxT;
  const stepPath = key => pts.slice(1).reduce((d, p) => `${d}H${X(p.t).toFixed(1)}V${Y(p[key]).toFixed(1)}`, `M${X(0)} ${Y(pts[0][key])}`) + `H${X(end).toFixed(1)}`;
  // Band: the upper bound left to right, then the lower bound back.
  let band = `${stepPath('hi')}V${Y(pts[pts.length - 1].lo).toFixed(1)}`;
  for (let i = pts.length - 1; i >= 1; i--) band += `H${X(pts[i].t).toFixed(1)}V${Y(pts[i - 1].lo).toFixed(1)}`;
  band += `H${X(0)}Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(s => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(s)}" y2="${Y(s)}"/><text class="tick" x="${m.l - 8}" y="${Y(s) + 4}" text-anchor="end">${fmtPct(s)}</text>`).join('');
  const every = tMax <= 20 ? 5 : tMax <= 60 ? 10 : 20;
  const xt = Array.from({ length: Math.floor(tMax / every) + 1 }, (_, i) => i * every)
    .map(t => `<text class="tick" x="${X(t)}" y="${H - 10}" text-anchor="middle">${t}${t === tMax ? ' min' : ''}</text>`).join('');
  let note = '';
  if (rec && rec.minutes <= tMax) {
    const x = X(rec.minutes), anchor = x > W - 110 ? 'end' : 'start', dx = anchor === 'end' ? -6 : 6;
    note = `<line class="ref" x1="${x}" x2="${x}" y1="${m.t}" y2="${H - m.b}"/>` +
      `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${Y(target)}" y2="${Y(target)}"/>` +
      `<text class="ref-label" x="${x + dx}" y="${m.t + 12}" text-anchor="${anchor}">for you: ${rec.minutes} min</text>`;
  }
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Share of sessions still slip-free by minute">
    ${grid}${xt}
    <path class="band" d="${band}"/>
    ${note}
    <path class="line" d="${stepPath('s')}"/>
    <g class="cross" hidden><line class="cross-line" y1="${m.t}" y2="${H - m.b}"/><circle class="cross-dot" r="5"/></g>
    <rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" data-x0="${m.l}" data-x1="${W - m.r}" data-tmax="${tMax}" data-top="${m.t}" data-bottom="${H - m.b}"/>
  </svg>`;
}

// Crosshair + tooltip for the survival chart.
export function bindSurvival(box, km, tip) {
  const svg = box.querySelector('svg'), hit = svg?.querySelector('.hit');
  if (!hit) return;
  const g = svg.querySelector('.cross'), line = g.querySelector('line'), dot = g.querySelector('circle');
  const { x0, x1, tmax, top, bottom } = Object.fromEntries(Object.entries(hit.dataset).map(([k, v]) => [k, +v]));
  const move = e => {
    const b = svg.getBoundingClientRect(), sx = (e.clientX - b.left) * (svg.viewBox.baseVal.width / b.width);
    const t = Math.max(0, Math.min(tmax, ((sx - x0) / (x1 - x0)) * tmax));
    if (t > km.maxT) { g.toggleAttribute('hidden', true); tip.show(e, `${Math.round(t)} min: no sessions ran this long yet`); return; }
    let at = km.points[0];
    for (const q of km.points) if (q.t <= t) at = q;
    const x = x0 + (t / tmax) * (x1 - x0), y = top + (1 - at.s) * (bottom - top);
    g.toggleAttribute('hidden', false);
    line.setAttribute('x1', x); line.setAttribute('x2', x);
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    tip.show(e, `<strong>${Math.round(t)} min in: ${fmtPct(at.s)} still slip-free</strong><br>95% interval ${fmtPct(at.lo)}–${fmtPct(at.hi)}`);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { g.toggleAttribute('hidden', true); tip.hide(); });
}

// ---------- slips by hour of day ----------

export function hoursChart(hr, { width }) {
  const W = Math.max(280, width), H = 210, m = { l: 34, r: 8, t: 22, b: 30 };
  const rates = hr.hours.map(h => h.rate ?? 0), top = Math.max(1, ...rates) * 1.12;
  const bw = (W - m.l - m.r) / 24, Y = v => m.t + (1 - v / top) * (H - m.t - m.b), y0 = H - m.b;
  const seen = hr.hours.filter(h => h.exposure >= 1);
  const worst = seen.slice().sort((a, b) => b.rate - a.rate)[0];
  const ticks = [0, top / 2].map(v => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v ? v.toFixed(1) : 0}</text>`).join('');
  const bars = hr.hours.map(h => {
    const x = m.l + h.hour * bw + 1, w = Math.max(2, bw - 2);
    const tipText = h.exposure
      ? `<strong>${hourName(h.hour)}: ${h.rate.toFixed(1)} slips per focus hour</strong><br>${h.events} slip${h.events === 1 ? '' : 's'} in ${Math.round(h.exposure * 60)} min watched` + (h.exposure < 1 ? ' · thin data, pulled toward your average' : '')
      : `<strong>${hourName(h.hour)}</strong><br>No focus time logged at this hour`;
    const cls = 'bar-mark';
    const mark = h.exposure ? `<path class="${cls}${h.exposure < 1 ? ' is-thin' : ''}" d="${vbar(x, y0, w, Y(h.rate))}"/>` : `<rect class="bar-empty" x="${x}" y="${y0 - 2}" width="${w}" height="2"/>`;
    return `${mark}<rect class="hit-bar" x="${x - 1}" y="${m.t}" width="${bw}" height="${y0 - m.t}" data-tip="${attr(tipText)}"/>`;
  }).join('');
  const label = (h, text) => {
    if (!h) return '';
    const cx = m.l + (h.hour + 0.5) * bw, anchor = cx < 60 ? 'start' : cx > W - 60 ? 'end' : 'middle';
    return `<text class="bar-label-svg" x="${cx}" y="${Y(h.rate) - 6}" text-anchor="${anchor}">${text}</text>`;
  };
  const xt = [0, 6, 12, 18].map(h => `<text class="tick" x="${m.l + (h + 0.5) * bw}" y="${H - 10}" text-anchor="middle">${hourTick(h)}</text>`).join('');
  const avg = hr.global ? `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${Y(hr.global)}" y2="${Y(hr.global)}"/><text class="ref-label halo" x="${m.l + 4}" y="${Y(hr.global) - 5}">avg ${hr.global.toFixed(1)}</text>` : '';
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Slips per focus hour by hour of day">
    ${ticks}${bars}${avg}${worst ? label(worst, `worst ${hourTick(worst.hour)}`) : ''}${xt}
  </svg>`;
}

// ---------- what moves the risk (odds ratios, log scale) ----------

export function effectsChart(fx, { width }) {
  const W = Math.max(280, width), row = 46, m = { l: 12, r: 56, t: 26, b: 26 };
  const H = m.t + fx.length * row + m.b, lim = 2; // log2 domain: x0.25 to x4
  const X = v => m.l + ((Math.max(-lim, Math.min(lim, Math.log2(v))) + lim) / (2 * lim)) * (W - m.l - m.r);
  const ticks = [0.25, 0.5, 1, 2, 4].map(v => `<line class="${v === 1 ? 'axis' : 'grid'}" x1="${X(v)}" x2="${X(v)}" y1="${m.t - 6}" y2="${H - m.b + 4}"/><text class="tick" x="${X(v)}" y="${H - 8}" text-anchor="middle">×${v}</text>`).join('');
  const rows = fx.map((f, i) => {
    const y = m.t + i * row, by = y + 20, up = f.or >= 1, clear = f.lo > 1 || f.hi < 1;
    const val = `×${f.or < 10 ? f.or.toFixed(2).replace(/0$/, '') : Math.round(f.or)}`;
    const tipText = `<strong>${f.label}: ${val} odds of slipping</strong><br>95% interval ×${f.lo.toFixed(2)} to ×${f.hi.toFixed(2)}${clear ? '' : '<br>Interval includes ×1, so the direction isn’t settled yet'}`;
    return `<text class="row-label" x="${m.l}" y="${y + 10}">${attr(f.label)}</text>
      <path class="fx ${up ? 'fx-up' : 'fx-down'}${clear ? '' : ' is-unclear'}" d="${hbar(X(1), X(f.or), by - 5, 10)}"/>
      <line class="whisker" x1="${X(f.lo)}" x2="${X(f.hi)}" y1="${by}" y2="${by}"/>
      <text class="fx-val" x="${W - 2}" y="${by + 4}" text-anchor="end">${val}</text>
      <rect class="hit-bar" x="0" y="${y}" width="${W}" height="${row}" data-tip="${attr(tipText)}"/>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Effect of each factor on the odds of slipping">
    <text class="tick" x="${X(1) - 8}" y="12" text-anchor="end">← lowers risk</text><text class="tick" x="${X(1) + 8}" y="12">raises risk →</text>
    ${ticks}${rows}
  </svg>`;
}

// ---------- calibration: predicted vs observed ----------

export function calibrationChart(cal, { width }) {
  const W = Math.min(360, Math.max(240, width)), H = 220, m = { l: 42, r: 12, t: 12, b: 34 };
  const top = Math.max(0.05, ...cal.map(c => Math.max(c.predicted, c.observed))) * 1.15;
  const X = v => m.l + (v / top) * (W - m.l - m.r), Y = v => H - m.b - (v / top) * (H - m.t - m.b);
  const ticks = [0, top / 2, top].map(v => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${fmtPct(v)}</text><text class="tick" x="${X(v)}" y="${H - 18}" text-anchor="middle">${fmtPct(v)}</text>`).join('');
  const dots = cal.map(c => `<circle class="cal-dot" cx="${X(c.predicted)}" cy="${Y(c.observed)}" r="5"/><circle class="hit-dot" cx="${X(c.predicted)}" cy="${Y(c.observed)}" r="14" data-tip="${attr(`<strong>Predicted ${(c.predicted * 100).toFixed(1)}% per minute</strong><br>Observed ${(c.observed * 100).toFixed(1)}% over ${c.n} minutes`)}"/>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Predicted versus observed slip rate">
    ${ticks}<line class="ref" x1="${X(0)}" y1="${Y(0)}" x2="${X(top)}" y2="${Y(top)}"/>
    <text class="tick" x="${(m.l + W - m.r) / 2}" y="${H - 2}" text-anchor="middle">predicted risk per minute</text>
    ${dots}
  </svg>`;
}

// ---------- tooltip ----------

export function makeTip(el) {
  return {
    show(e, html) {
      el.innerHTML = html;
      el.hidden = false;
      const pad = 12, b = el.getBoundingClientRect();
      let x = e.clientX + pad, y = e.clientY - b.height - pad;
      if (x + b.width > innerWidth - 8) x = e.clientX - b.width - pad;
      if (y < 8) y = e.clientY + pad * 2;
      el.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
    },
    hide() { el.hidden = true; },
  };
}

export function bindTips(root, tip) {
  const over = e => {
    const t = e.target.closest?.('[data-tip]');
    if (t && root.contains(t)) tip.show(e, t.dataset.tip);
  };
  root.addEventListener('pointermove', over);
  root.addEventListener('pointerdown', over);
  root.addEventListener('pointerout', e => { if (e.target.closest?.('[data-tip]') && !e.relatedTarget?.closest?.('[data-tip]')) tip.hide(); });
}
