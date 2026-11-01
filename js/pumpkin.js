// Jack, as a self-contained SVG string. A pure function of state, so the same art works on the page,
// in the graveyard, and when drawn onto a canvas for share cards (no CSS variables, no external refs).

const FRESH = {
  hi: [255, 184, 92], mid: [244, 118, 24], lo: [170, 60, 8], depth: [110, 34, 4],
  stem: [98, 118, 48], leaf: [120, 156, 66], glowIn: [255, 252, 222], glowMid: [255, 218, 92], glowOut: [255, 168, 46],
};
const ROTTEN = {
  hi: [156, 146, 96], mid: [110, 100, 60], lo: [60, 52, 32], depth: [32, 28, 18],
  stem: [74, 60, 40], leaf: [108, 84, 46], glowIn: [214, 204, 140], glowMid: [164, 150, 88], glowOut: [96, 84, 46],
};

// Carved features per mood. Stroked features are drawn as thick lines instead of filled holes.
const FACES = {
  happy: {
    eyes: ['M128 240 L155 192 L182 240 Z', 'M218 240 L245 192 L272 240 Z'],
    nose: 'M191 266 L200 250 L209 266 Z',
    mouth: 'M116 272 Q138 292 158 290 L165 303 L175 291 Q200 296 225 291 L235 303 L242 290 Q262 292 284 272 Q276 330 228 340 L220 328 L212 342 Q200 344 188 342 Q132 336 116 272 Z',
  },
  focused: {
    eyes: ['M128 224 L182 236 L176 250 Q152 256 134 246 Z', 'M272 224 L218 236 L224 250 Q248 256 266 246 Z'],
    nose: 'M192 270 L200 256 L208 270 Z',
    mouth: 'M150 290 Q200 308 250 290 Q244 320 200 324 Q156 320 150 290 Z',
  },
  suspicious: {
    eyes: ['M128 232 L182 228 L180 242 L130 246 Z', 'M220 242 L246 198 L272 242 Z'],
    nose: 'M192 270 L200 256 L208 270 Z',
    mouth: 'M156 298 L244 288 L246 302 L158 312 Z',
  },
  sad: {
    eyes: ['M128 240 L178 212 L180 244 Q154 254 128 240 Z', 'M272 240 L222 212 L220 244 Q246 254 272 240 Z'],
    nose: 'M192 274 L200 260 L208 274 Z',
    mouth: 'M148 322 Q200 266 252 322 L240 326 Q200 292 160 326 Z',
  },
  horrified: {
    eyes: ['M126 216 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0 Z', 'M222 216 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0 Z'],
    mouth: 'M178 302 a22 30 0 1 0 44 0 a22 30 0 1 0 -44 0 Z',
  },
  celebrate: {
    eyes: ['M130 232 Q155 192 180 232', 'M220 232 Q245 192 270 232'],
    eyeStroke: true,
    mouth: 'M124 266 L160 266 L166 282 L174 266 L226 266 L234 282 L240 266 L276 266 Q270 344 200 346 Q130 344 124 266 Z',
  },
  sleeping: {
    eyes: ['M130 226 Q155 246 180 226', 'M220 226 Q245 246 270 226'],
    eyeStroke: true, blink: false,
    mouth: 'M184 300 Q200 292 216 300 Q214 316 200 316 Q186 316 184 300 Z',
  },
  dead: {
    eyes: ['M134 198 L176 240 M176 198 L134 240', 'M224 198 L266 240 M266 198 L224 240'],
    eyeStroke: true, blink: false,
    mouth: 'M146 304 q13.5 -14 27 0 t27 0 t27 0 t27 0',
    mouthStroke: true,
  },
};

// [x, y, radius, rot% at which it appears]
const SPOTS = [
  [104, 292, 15, 2], [302, 206, 11, 9], [292, 318, 17, 16], [140, 176, 10, 24], [324, 270, 13, 32],
  [80, 230, 13, 40], [206, 150, 9, 48], [160, 340, 16, 56], [262, 160, 12, 64], [112, 324, 12, 72],
  [338, 230, 9, 80], [228, 252, 8, 88], [70, 268, 10, 94],
];

const SCALE = [0.86, 0.9, 0.94, 0.97, 1, 1.04];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = r => 1 - Math.pow(1 - r, 1.6); // early rot shows up fast
let uid = 0;

function palette(rot) {
  const t = ease(clamp(rot, 0, 100) / 100);
  return k => `rgb(${FRESH[k].map((v, i) => Math.round(lerp(v, ROTTEN[k][i], t))).join(',')})`;
}

export function renderPumpkin({ rot = 0, mood = 'happy', stage = 0, newSpotsFrom = null, animated = true, size = null } = {}) {
  const r = clamp(rot, 0, 100) / 100;
  const t = ease(r);
  const c = palette(rot);
  const id = `jk${++uid}`;
  const face = FACES[mood] || FACES.happy;
  const S = SCALE[stage] ?? 1;
  const sx = (1 + r * 0.1).toFixed(3), sy = (1 - r * 0.14).toFixed(3);
  const cls = name => (animated ? ` class="${name}"` : '');

  const feature = (d, stroked) => stroked
    ? `<path d="${d}" fill="none" stroke="${c('depth')}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" transform="translate(3 5)"/>` +
      `<path d="${d}" fill="none" stroke="url(#${id}-glow)" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="${d}" fill="${c('depth')}" transform="translate(3 5)"/><path d="${d}" fill="url(#${id}-glow)"/>`;

  const stem = stage >= 4 ? '' : `<g transform="rotate(${(r * 30).toFixed(1)} 200 134)">
    <path d="M196 122 C180 100 150 98 134 108 C152 112 166 128 196 126 Z" fill="${c('leaf')}"/>
    <path d="M190 138 C188 112 191 96 203 80 C206 75 214 77 216 83 C208 98 207 116 212 138 Z" fill="${c('stem')}"/>
    <path d="M213 104 c16 -8 30 0 28 12 c-2 9 -14 9 -14 1" fill="none" stroke="${c('leaf')}" stroke-width="4" stroke-linecap="round"/>
  </g>`;

  const rib = (cx, rx, ry, grad) =>
    `<ellipse cx="${cx}" cy="240" rx="${rx}" ry="${ry}" fill="url(#${id}-${grad})" stroke="${c('lo')}" stroke-opacity=".55" stroke-width="2"/>`;
  const ribs = rib(118, 84, 100, 'side') + rib(282, 84, 100, 'side') + rib(158, 82, 110, 'inner') + rib(242, 82, 110, 'inner') + rib(200, 74, 115, 'center');

  const bruise = r > 0.18
    ? `<g filter="url(#${id}-blur)" opacity="${Math.min(0.6, (r - 0.18) * 1.1).toFixed(2)}" fill="rgb(66,44,18)">
        <ellipse cx="118" cy="300" rx="40" ry="26"/><ellipse cx="290" cy="200" rx="32" ry="24"/>
        <ellipse cx="236" cy="336" rx="30" ry="16"/><ellipse cx="170" cy="150" rx="26" ry="14"/></g>`
    : '';

  const spots = SPOTS.filter(s => s[3] <= rot).map(([x, y, rr, at]) => {
    const fresh = animated && newSpotsFrom != null && at > newSpotsFrom;
    return `<g filter="url(#${id}-fuzz)"${fresh ? ' class="pop"' : ''}>
      <circle cx="${x}" cy="${y}" r="${rr}" fill="#a4ae86"/>
      <circle cx="${(x - rr * 0.28).toFixed(1)}" cy="${(y - rr * 0.22).toFixed(1)}" r="${(rr * 0.5).toFixed(1)}" fill="#d6dcc0" opacity=".85"/>
      <circle cx="${(x + rr * 0.42).toFixed(1)}" cy="${(y + rr * 0.38).toFixed(1)}" r="${Math.max(2, rr * 0.2).toFixed(1)}" fill="#6d7850"/></g>`;
  }).join('');

  const highlight = `<ellipse cx="158" cy="160" rx="11" ry="24" transform="rotate(-24 158 160)" fill="#fff" opacity="${(0.22 * (1 - t)).toFixed(2)}"/>`;

  const eyes = face.eyes.map(d => feature(d, face.eyeStroke)).join('');
  const faceSvg = `<g data-face="1"><g opacity="${(1 - r * 0.25).toFixed(2)}"><g${cls('glow')}>
    <g${animated && face.blink !== false ? ' class="eyes"' : ''}>${eyes}</g>
    ${face.nose ? feature(face.nose) : ''}${feature(face.mouth, face.mouthStroke)}
  </g></g></g>`;

  const goo = r > 0.55
    ? `<ellipse cx="200" cy="352" rx="${(70 + (r - 0.55) * 220).toFixed(1)}" ry="${(8 + (r - 0.55) * 22).toFixed(1)}" fill="rgb(92,102,50)" opacity=".6"/>`
    : '';

  const nFlies = r >= 0.85 ? 3 : r >= 0.65 ? 2 : r >= 0.45 ? 1 : 0;
  const flies = Array.from({ length: nFlies }, (_, i) => {
    const radius = [168, 140, 190][i];
    const fly = `<g transform="translate(${200 + radius} 236) scale(1 1.8)">
      <ellipse${cls('wing')} cx="-3" cy="-4" rx="5" ry="2.6" fill="#dfe6f5" opacity=".75"/>
      <ellipse${cls('wing')} cx="3" cy="-4" rx="5" ry="2.6" fill="#dfe6f5" opacity=".75"/>
      <ellipse rx="5.5" ry="3.4" fill="#15111c"/></g>`;
    const orbit = animated
      ? `<g class="fly-orbit" style="animation-duration:${[3.6, 2.8, 4.4][i]}s;animation-delay:-${(i * 1.1).toFixed(1)}s${i === 1 ? ';animation-direction:reverse' : ''}">${fly}</g>`
      : `<g transform="rotate(${[20, 150, 260][i]} 200 236)">${fly}</g>`;
    return `<g transform="translate(200 236) scale(1 .55) translate(-200 -236)">${orbit}</g>`;
  }).join('');

  const zzz = mood === 'sleeping'
    ? `<g${cls('zzz')} fill="#d9cff0" font-family="system-ui, sans-serif" font-weight="800">
        <text x="276" y="128" font-size="30">z</text><text x="300" y="98" font-size="24">z</text><text x="320" y="74" font-size="18">z</text></g>`
    : '';

  const ribbon = stage >= 3 ? `<g transform="translate(306 292) rotate(14)">
    <path d="M-12 8 L-22 52 L-10 44 L-4 58 L4 10 Z" fill="#2c55c9"/><path d="M12 8 L20 54 L8 46 L0 60 L-4 10 Z" fill="#2348ad"/>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<circle cx="${(Math.cos(a) * 20).toFixed(1)}" cy="${(Math.sin(a) * 20).toFixed(1)}" r="8" fill="#3b6cf2"/>`;
    }).join('')}
    <circle r="20" fill="#3b6cf2"/><circle r="13" fill="#f6d36b"/>
    <text y="4.5" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#2348ad">1st</text>
  </g>` : '';

  const cap = stage === 4 ? `<g transform="translate(200 128) rotate(-7)">
    <path d="M-48 -4 Q0 12 48 -4 L48 18 Q0 34 -48 18 Z" fill="#1d1d29"/>
    <path d="M-92 -14 L0 16 L92 -14 L92 -9 L0 21 L-92 -9 Z" fill="#14141d"/>
    <path d="M-92 -14 L0 -44 L92 -14 L0 16 Z" fill="#2e2e40"/>
    <path d="M0 -14 Q44 -10 64 -2 L66 34" fill="none" stroke="#f2c94c" stroke-width="3" stroke-linecap="round"/>
    <path d="M60 32 L72 32 L70 58 L62 58 Z" fill="#f2c94c"/><circle cy="-14" r="5" fill="#f2c94c"/>
  </g>` : '';

  const crown = stage >= 5 ? `<g transform="translate(200 122)">
    <path d="M-60 12 L-68 -40 L-34 -12 L0 -54 L34 -12 L68 -40 L60 12 Z" fill="#f4c84a" stroke="#b9861c" stroke-width="3" stroke-linejoin="round"/>
    <rect x="-62" y="6" width="124" height="16" rx="5" fill="#e3b23a" stroke="#b9861c" stroke-width="3"/>
    <circle cx="-34" cy="14" r="5" fill="#e0475b"/><circle cy="14" r="6" fill="#4a7cf0"/><circle cx="34" cy="14" r="5" fill="#e0475b"/>
    <circle cx="-68" cy="-42" r="6" fill="#f4c84a"/><circle cy="-56" r="7" fill="#f4c84a"/><circle cx="68" cy="-42" r="6" fill="#f4c84a"/>
  </g>` : '';

  const sizeAttr = size ? ` width="${size}" height="${Math.round(size * 0.85)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 40 400 340"${sizeAttr} aria-hidden="true">
  <defs>
    <radialGradient id="${id}-center" cx=".4" cy=".32" r=".75">
      <stop offset="0" stop-color="${c('hi')}"/><stop offset=".5" stop-color="${c('mid')}"/><stop offset="1" stop-color="${c('lo')}"/>
    </radialGradient>
    <radialGradient id="${id}-inner" cx=".45" cy=".3" r=".8">
      <stop offset="0" stop-color="${c('hi')}"/><stop offset=".45" stop-color="${c('mid')}"/><stop offset="1" stop-color="${c('lo')}"/>
    </radialGradient>
    <radialGradient id="${id}-side" cx=".5" cy=".35" r=".8">
      <stop offset="0" stop-color="${c('mid')}"/><stop offset="1" stop-color="${c('lo')}"/>
    </radialGradient>
    <radialGradient id="${id}-glow" gradientUnits="userSpaceOnUse" cx="200" cy="262" r="140">
      <stop offset="0" stop-color="${c('glowIn')}"/><stop offset=".45" stop-color="${c('glowMid')}"/><stop offset="1" stop-color="${c('glowOut')}"/>
    </radialGradient>
    <filter id="${id}-fuzz" x="-40%" y="-40%" width="180%" height="180%">
      <feTurbulence type="fractalNoise" baseFrequency=".35" numOctaves="2" seed="3"/>
      <feDisplacementMap in="SourceGraphic" scale="7"/>
    </filter>
    <filter id="${id}-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
  </defs>
  <g transform="translate(200 352) scale(${S}) translate(-200 -352)">
    <ellipse cx="200" cy="354" rx="150" ry="16" fill="#000" opacity=".35"/>
    ${goo}
    <g transform="translate(200 352) scale(${sx} ${sy}) translate(-200 -352)">
      ${stem}${ribs}${bruise}${spots}${highlight}${faceSvg}${ribbon}${cap}${crown}
    </g>
    ${flies}${zzz}
  </g>
</svg>`;
}

// Small pumpkin for the tab icon, so the rot is visible from the tab strip. Optional ring shows session progress.
export function drawFavicon(canvas, rot, progress = null) {
  const x = canvas.getContext('2d');
  const r = clamp(rot, 0, 100) / 100;
  const c = palette(rot);
  const ell = (cx, cy, rx, ry) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill(); };
  x.clearRect(0, 0, canvas.width, canvas.height);
  x.save();
  x.scale(canvas.width / 64, canvas.height / 64);
  if (progress != null) {
    x.lineWidth = 5;
    x.strokeStyle = 'rgba(255,255,255,.2)';
    x.beginPath(); x.arc(32, 32, 29, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#a6dc6e';
    x.beginPath(); x.arc(32, 32, 29, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); x.stroke();
    x.translate(32, 34); x.scale(0.74, 0.74); x.translate(-32, -34);
  }
  x.translate(32, 60); x.scale(1 + r * 0.08, 1 - r * 0.12); x.translate(-32, -60);
  x.fillStyle = c('stem'); x.fillRect(29, 4, 7, 14);
  x.fillStyle = c('lo'); ell(19, 38, 15, 21); ell(45, 38, 15, 21);
  x.fillStyle = c('mid'); ell(32, 38, 15, 23);
  x.fillStyle = r > 0.5 ? '#1d1a10' : '#3a1404';
  x.beginPath(); x.moveTo(16, 36); x.lineTo(23, 25); x.lineTo(29, 36); x.fill();
  x.beginPath(); x.moveTo(35, 36); x.lineTo(41, 25); x.lineTo(48, 36); x.fill();
  x.beginPath(); x.moveTo(15, 43); x.quadraticCurveTo(32, 60, 49, 43); x.quadraticCurveTo(32, 49, 15, 43); x.fill();
  x.fillStyle = '#b8c296';
  for (const [sx, sy, sr, at] of [[10, 30, 4.5, 4], [52, 44, 4.5, 20], [26, 54, 4, 40], [48, 24, 3.5, 60], [12, 46, 3.5, 80]]) {
    if (rot >= at) ell(sx, sy, sr, sr);
  }
  x.restore();
}
