# Gourdian 🎃

**The focus timer that rots when you procrastinate.**

Start a session and Jack the pumpkin watches your tab. Wander off to TikTok and Jack starts to rot in real time:
mold spots, a sagging body, flies, a puddle of goo. The tab title starts guilt-tripping you ("🎃 you left me on read"),
and the favicon rots in your tab bar. When you come back, you have to confess where you went.

Built for **Pumpkin Playground** (CSULB ACM, fall 2026), then extended with an on-device analytics layer for
**DataNova 2026** (see [DATANOVA.md](DATANOVA.md)).

![Fresh Jack vs. rotten Jack](media/thumbnail.png)

## Try it

- Live: https://ashank-crazy.github.io/gourdian/
- Locally: `python3 -m http.server 8642` in this folder, then open http://127.0.0.1:8642

No install, no accounts, no build step. Everything is stored in your browser's `localStorage`.

## How it works

| You do | Jack does |
| --- | --- |
| Start a 1, 15, 25, 50 or custom-minute session | Watches your tab, heals a little every minute you stay |
| Leave the tab for more than 10 s | Rots about 12% per minute. The title and favicon update live |
| Come back | Asks where you went: Instagram, TikTok, YouTube, texting, games, shopping, snacks, the void… |
| Say "working in another tab, I swear" | Undoes the rot. Twice per session. After that, half credit and a squint |
| Finish the session | Gives you a graded report card (A+ "Prize Pumpkin" to F "Compost") and offers a 5-minute break |
| Skip studying for days | Rots 8% per day of neglect |
| Hit 100% rot | Dies. You get an obituary with the cause of death, and the pumpkin goes to the graveyard |

Each pumpkin grows with its focus time: Tiny Gourd → Pie Pumpkin → Jack-o'-Lantern → Prize Pumpkin (blue ribbon) →
Honor-Roll Pumpkin (grad cap) → Gourd-zilla (crown). When one dies, its progress goes with it.

**Stats** shows total focus, streak, recent sessions with grades, and **Pumpkin killers**: a ranking of where your
time actually went, built from your own confessions. **Graveyard** keeps a tombstone for every pumpkin you've lost.

Report cards and obituaries save as 1080×1350 images, sized for Instagram stories. On phones they open the share sheet.

### Insights: the data behind the guilt

Every session logs when you left the tab, for how long, and where you said you went. The **Insights** tab turns that
log into decisions, all computed in your browser:

| Question | Method | Decision it drives |
| --- | --- | --- |
| How long do I last before my first slip? | Kaplan–Meier survival curve, Greenwood 95% band, clean sessions censored | A **"for you" session length** chip: the longest length that keeps ~70% of sessions slip-free |
| When do I slip? | Slips per focus hour by clock hour, Gamma–Poisson empirical-Bayes shrinkage | Which part of the day to protect |
| What raises my risk right now? | Discrete-time logistic hazard model, MAP fit (Newton + line search) with a weak prior | A live **slip-risk meter** and Jack's just-in-time warnings |
| Does the model work? | Chronological 70/30 holdout: AUC, Brier skill, log loss, calibration | Trust (or not) in the meter |
| Do Jack's warnings work? | Micro-randomized trial: at high-risk moments Jack warns at random half the time | Whether to keep warning you |
| What does each distraction cost? | Median and 90th-percentile trip length per culprit | Which app to put away |

A **Sample student** (synthetic, clearly labelled) fills the page for first-time visitors and judges. The same code is
checked against ground truth on 200 simulated students in [analysis/RESULTS.md](analysis/RESULTS.md).

### Extras

- Click Jack for a poke (and a complaint). The carved face follows your cursor.
- The bell button turns on notifications: one nag after a minute away, and a ping when the timer or a break ends.
- `?demo` speeds rot up (3 s grace, 60%/min) and adds a 10-second session, which helps when recording a demo.
- Insights can export your log (or the sample student) as CSV or JSON.

## Under the hood

- Vanilla HTML, CSS and JavaScript modules. No frameworks, no dependencies.
- Jack is generated SVG (`js/pumpkin.js`): one pure function of rot, mood, and growth stage. The same function draws
  the page, the graveyard, the share cards, and a canvas version for the favicon.
- Leaving and returning use the Page Visibility API. A Web Worker keeps the clock ticking in background tabs,
  where browsers throttle normal timers to once a minute.
- If you close the tab mid-session, the time it was closed counts as time away when you come back.
- Sound effects are synthesized with the Web Audio API, so there are no audio files.
- Fonts: Fraunces and DM Sans from Google Fonts.
- The analytics (`js/insights.js`) are pure functions with no DOM access, so the page, the sample student, the unit
  tests and the validation study all run the same code. Charts are hand-drawn SVG.

## Tests and validation

Needs Node 20+ (no packages to install).

```
npm test            # unit tests, including a textbook Kaplan–Meier check
npm run validate    # validation study on 200 synthetic students; rewrites analysis/RESULTS.md (~10 s)
npm run sample      # rewrites data/sample-*.csv from the sample student
```

GitHub Actions runs the tests and a quick validation pass before every deploy.

## The data

Stored in `localStorage` under `gourdian:v1`. Sessions logged before the Insights update have no trip timing and are
left out of the models. Exports (and the files in `data/`) use these columns:

**sessions** · one row per session, oldest first

| Column | Meaning |
| --- | --- |
| `session_id` | 1, 2, 3… in start order |
| `started_at`, `ended_at` | ISO 8601 timestamps (UTC) |
| `weekday`, `start_hour` | local day (0 = Sunday) and hour the session started |
| `planned_min` | length picked on the timer |
| `elapsed_sec` | seconds the timer ran, pauses excluded (shorter than planned if abandoned) |
| `unexcused_sec` | seconds away that weren't excused as work |
| `trips`, `slips` | trips away (10 s or longer) and the unexcused ones among them |
| `first_slip_sec` | seconds into the session of the first slip; empty if none (a censored observation) |
| `peeks` | trips shorter than the 10 s grace period |
| `warnings_sent`, `warnings_withheld` | high-risk moments where Jack did / randomly did not warn |
| `top_culprit`, `grade`, `outcome`, `task` | biggest distraction, report-card grade, finished / abandoned / died, task name |

**trips** · one row per trip away: `session_id`, `left_at`, `left_at_sec` (seconds into the session), `duration_sec`,
`culprit` (`instagram`, `tiktok`, `youtube`, `texting`, `games`, `shopping`, `snack`, `void`, or `work`), `excused`
(1 for work).

**warnings** · one row per high-risk moment: `session_id`, `minute`, `risk` (predicted chance of a slip within 5
minutes), `sent` (1 if Jack warned, 0 if the warning was withheld as the control).

## Files

```
index.html         page structure
styles.css         all styling (night sky, cards, dialogs, responsive rules)
js/app.js          state, timer, visibility handling, confessions, stats, insights page, share cards
js/insights.js     analytics: survival curves, hourly rates, risk model, model checks, exports
js/charts.js       SVG charts for the Insights page
js/simulate.js     synthetic students (the sample student and the validation cohort)
js/pumpkin.js      Jack: SVG renderer and favicon renderer
js/lines.js        everything Jack says, plus grades, growth stages and causes of death
js/sound.js        Web Audio sound effects
analysis/          unit tests, validation study, RESULTS.md
data/              the sample student as CSV
media/             social preview, Devpost gallery images
```

## Credits

Made by ashank-crazy for Pumpkin Playground. Built with help from Claude Code (Anthropic).
