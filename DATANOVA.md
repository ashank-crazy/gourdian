# DataNova 2026 submission: Gourdian

Paste-ready copy for https://datanova-2026-global-data-thon.devpost.com. Round 1 deliverables: **PPT, working demo
link, optional video.** Round 1 closes **Nov 10, 2026**; shortlisted teams present in Round 2 by Nov 25.

---

**Project name:** Gourdian

**Tagline:** A focus timer that learns when you're about to procrastinate, and a pumpkin that rots when you do.
All of the data science runs on your own device.

**Track:** DN-OP-01 Open Innovation (bring your own problem). It also fits Education, and Healthcare & Social
Impact (digital wellbeing).

**Working demo:** https://ashank-crazy.github.io/gourdian/ (open the **Insights** tab; the *Sample student* is
preselected for new visitors)
**Code:** https://github.com/ashank-crazy/gourdian
**Validation report:** [analysis/RESULTS.md](analysis/RESULTS.md) · **Dataset:** [data/](data/) and the data
dictionary in the [README](README.md#the-data)

**Built with:** `javascript` `svg` `survival-analysis` `logistic-regression` `empirical-bayes`
`micro-randomized-trial` `page-visibility-api` `web-workers` `node-test` `github-actions` `github-pages`

---

## Overview

Gourdian is a Pomodoro-style focus timer guarded by Jack, a pumpkin who watches your browser tab. Leave to scroll
and Jack rots in real time; come back and you confess where you went. Every session becomes a precise, minute-level
record of *when* you leave, *for how long*, and *where to*.

The DataNova work turns that record into decisions:

1. **A session length fitted to you.** A survival curve of "minutes until the first slip" picks the longest session
   that keeps about 70% of your sessions slip-free, and the timer offers it as a "for you" option.
2. **A live slip-risk meter.** A discrete-time hazard model, trained in the browser on your own history, predicts
   the chance you'll leave in the next 5 minutes, every minute you work.
3. **Just-in-time warnings that measure themselves.** At high-risk moments Jack warns you, but only half the time,
   at random. Comparing warned and unwarned moments estimates whether the warnings actually work for you
   (a micro-randomized trial, the design used to build just-in-time adaptive interventions in mobile health).
4. **An honest model check.** The app scores its own model on sessions it hasn't seen (AUC, Brier skill, log loss,
   calibration) and shows the result, weak or strong.

No accounts, no server, no third-party analytics. The data never leaves the browser unless you export it.

## Problem statement

**Students lose study time to self-interruption, and they can't see the pattern.**

- Procrastination is close to universal in college: a meta-analysis estimated that 80–95% of college students
  procrastinate, and about half do so consistently and problematically (Steel, 2007, *Psychological Bulletin*).
- Interruptions are costly beyond the minutes lost: people compensate by working faster, at the price of more
  stress and frustration (Mark, Gudith & Klocke, 2008, *CHI*).
- Existing focus tools are either **blockers** (they stop you, but teach you nothing and are easy to disable) or
  **timers** (a fixed 25-minute Pomodoro for everyone, with no evidence that 25 is right for *you*). Neither tells a
  student when they're most likely to slip, what it costs them, or whether an intervention helps.

**Who it's for:** students working in a browser (problem sets, essays, online coursework), and the instructors,
advisors and digital-wellbeing researchers who want evidence about distraction without surveillance.

**Why it matters:** Attention is the input to all study time. A tool that measures self-interruption honestly,
predicts it, and tests interventions on one person at a time can make an hour of studying produce more learning,
without blocking anything or collecting data on a server.

## Solution and methodology

### Data collection (on device)

The Page Visibility API detects when the tab is hidden; a Web Worker keeps time in background tabs. Each trip away
of 10 s or more triggers a confession (Instagram, TikTok, YouTube, texting, games, shopping, snack run, "no idea",
or "working in another tab"). The app stores one record per session with the timing of every trip, every peek
under 10 s, and every warning decision. A **slip** is any unexcused trip; work trips are logged but never counted
as slips.

### 1. Survival analysis: how long until the first slip?

Each session contributes a time to its first slip, or a **censored** time if it ended slip-free. The
**Kaplan–Meier** estimator (Kaplan & Meier, 1958) handles censoring correctly, so finishing clean doesn't bias the
curve; the 95% band uses Greenwood's variance on the log(−log) scale. The **recommended session length** is the
point where the curve falls below 70%, rounded to 5 minutes and kept between 10 and 50.

### 2. When: slip rates by hour, with shrinkage

Slips per focus hour are computed for each clock hour. Raw rates from a few minutes of data are noise, so each hour
is shrunk toward the person's overall rate with a **Gamma–Poisson empirical-Bayes** estimator (the approach used in
disease mapping; Clayton & Kaldor, 1987). The page also pools hours into four parts of the day for a direct
comparison.

### 3. Risk model: discrete-time logistic hazard

Each watched minute is one row (Singer & Willett, 1993): *did a slip start in this minute, given the student was
present at its start?* Features: minutes into the session, whether they already slipped this session, part of day
(morning / afternoon / evening / late night), weekend, and planned length. The model is fit by **MAP logistic
regression**: Newton's method with a backtracking line search and a weak Gaussian prior. The prior is a stated,
hand-set guess (a ~2%/min base rate; effect directions from vigilance research and from late-night self-control
findings). The student's own data overrides it as it accumulates. Odds ratios are shown with 95% intervals from the
Laplace approximation, and the next-5-minute risk is the compounded per-minute hazard.

### 4. Intervention testing: a micro-randomized trial

When the predicted 5-minute risk reaches 30%, the app flips a coin: warn (Jack speaks up) or stay quiet (control),
then waits 8 minutes before deciding again. Because the choice is random at each moment, comparing the slip rate in
the next 5 minutes between the two arms estimates the **causal effect of a warning** for that student
(Klasnja et al., 2015; Nahum-Shani et al., 2018). Students can turn randomization off and always be warned.

### 5. Model checking in the app

A chronological split (fit on the oldest 70% of sessions, score the newest 30%) reports AUC, Brier skill against a
constant-rate baseline, log loss against the constant rate and against the prior alone, and a calibration plot.

## Dataset description

**Real usage data:** generated by each user, stored only in their browser (`localStorage`), exportable as CSV or
JSON from the Insights page. Three tables: **sessions** (one row per session), **trips** (one row per trip away,
with start offset, duration and confessed destination), and **warnings** (one row per high-risk moment, with
predicted risk and whether the warning was sent). Column definitions are in the [README](README.md#the-data). No
real user data is included in this submission: the app never transmits it, and we didn't collect any.

**Synthetic data:** `js/simulate.js` generates students minute by minute from a known hazard model, with personal
coefficients, habits (start times, session lengths, favorite distractions, trip lengths drawn from log-normal
distributions per app), occasional work trips, abandonment, and randomized warnings with a known effect. It powers:

- the **Sample student** on the demo (seeded, 71 sessions over six weeks; also in `data/sample-*.csv`), and
- the **validation cohort**: 200 students per scenario, regenerated deterministically by `npm run validate`.

Synthetic data is labelled as synthetic everywhere it appears.

## Technology stack

Vanilla JavaScript (ES modules), HTML and CSS; SVG for Jack and every chart; Page Visibility API, Web Workers,
Canvas and Web Audio in the browser; Node's built-in test runner for tests and the validation study; GitHub
Actions and GitHub Pages for CI and hosting. **Zero dependencies and no build step.** All statistics (Kaplan–Meier,
Greenwood intervals, Newton–Raphson MAP logistic regression, Laplace intervals, AUC, Brier, calibration, empirical
Bayes) are implemented from scratch in about 400 lines (`js/insights.js`), so they run on-device and the same file is
tested in Node.

## Implementation and demonstration

**For judges (2 minutes):**

1. Open https://ashank-crazy.github.io/gourdian/#insights. The **Sample student** loads: a synthetic night owl
   with a TikTok habit. Hover the charts for exact values.
2. Read the survival curve (median ~23 min, recommended length 15 min), the late-night vs. morning comparison
   (4.0×), the risk factors with intervals, the model check (held-out AUC 0.81), and the warning trial.
3. Switch to the **Focus** tab, start a 1-minute session, switch tabs for 15 seconds, come back and confess. Watch
   the slip-risk meter update, then open Insights → **Your data**.
4. For a sped-up demo, use https://ashank-crazy.github.io/gourdian/?demo (faster rot, 10-second session).

**Reproduce the analysis:**

```
git clone https://github.com/ashank-crazy/gourdian && cd gourdian
npm test            # 11 unit tests, including the textbook 6-MP Kaplan–Meier example
npm run validate    # 200-student validation study, ~10 s, rewrites analysis/RESULTS.md
```

## Results and validation

All of the following come from **synthetic** students with known ground truth ([full report](analysis/RESULTS.md)).
They show the methods recover what they should under the model's assumptions. They are not evidence about real
students; the pilot below is how we would get that.

| Check | Result |
| --- | --- |
| Unit tests | 11/11 pass, including Kaplan–Meier values and Greenwood SE from the 6-MP leukemia data (Freireich et al., 1963) |
| Held-out prediction, prior roughly right (200 students) | AUC **0.656** (ceiling with true coefficients 0.674; prior alone 0.636). Personal model beats the prior on log loss for 76% of students |
| Held-out prediction, prior wrong (200 students) | AUC **0.675** vs. **0.596** for the prior alone (ceiling 0.696). Personal model beats the prior for **91%** of students |
| Learning curve, prior wrong | AUC 0.591 → 0.629 → 0.670 → 0.686 with 0 → 10 → 40 → 80 sessions; log loss approaches the true-coefficient floor (0.2022 vs. 0.2001) |
| Calibration (pooled quintiles) | predicted 2.0 / 2.9 / 4.1 / 6.0 / 12.1% per minute vs. observed 2.2 / 3.2 / 4.1 / 5.5 / 11.3% |
| Coefficient intervals | 95% intervals contain the true value 91–99% of the time across all coefficients and both scenarios |
| Survival curve from six weeks of data | mean absolute error 0.044–0.056 at minutes 10–20; the 95% band contains the long-run truth 95–98% of the time |
| Recommended length | matches the long-run answer for 62% of students, within 5 minutes for 89% |
| Empirical-Bayes hourly rates | **88% lower** mean squared error than raw hourly rates |
| Warning trial, true effect −0.4 log-odds | estimated −7.0 points in 5-minute slip rate (95% CI −9.3 to −4.6) |
| Warning trial, no true effect (A/A check) | +0.2 points (95% CI −2.1 to 2.6): no false positive |
| Policy simulation: recommended length vs. fixed 25 min | slips per focus hour 2.76 → 2.12; slip-free sessions 45% → 66%; mean per-student change −9.9% (95% CI −16.4% to −3.4%) |

Minute-level prediction of a rare, noisy behavior is hard: an AUC around 0.65–0.70 is close to the ceiling the true
model itself reaches on the same data. The value is less in any single prediction than in the comparisons
(which hours, which apps, which session length, whether warnings help) and in tracking them over time.

## Responsible AI, privacy and security

- **On-device only.** The model trains and runs in the browser; there is no backend, no account, and no analytics
  script. The page only loads fonts from Google Fonts.
- **User control.** Export everything (CSV / JSON) or delete it with one button. Randomized warnings can be turned
  off.
- **Transparency.** Every chart says what method produced it; risk factors show intervals; faded bars mark
  estimates that aren't settled; the model check is shown even when it's unflattering; the starter prior is
  labelled as a guess.
- **No surveillance.** Gourdian only knows that the tab was hidden. Where you went comes from your own
  confession, and "working in another tab" is accepted (twice per session at full credit).
- **Honest synthetic data.** The sample student and the validation cohort are labelled synthetic wherever they
  appear; the sample's seed was chosen to make a readable demo, and the validation study uses random students.

## Impact and feasibility

- **Ready now:** a working, free web app with nothing to install. It runs on laptops and phones (on phones,
  switching apps counts as leaving).
- **Scales at zero marginal cost:** all computation is client-side; the hosting is a static site.
- **Who benefits:** students get a session length and study schedule fitted to their own data; instructors and
  learning centers get a privacy-preserving tool they can recommend; researchers get an n-of-1 micro-randomized
  trial platform with no server to secure.
- **Next steps:**
  1. A consented pilot with real students (opt-in, anonymized export) to estimate population effects and replace
     the hand-set prior with an empirical one.
  2. A proper MRT analysis that accounts for repeated measures within each student (weighted and centered least
     squares; Boruvka et al., 2018), pooling across consenting users.
  3. Contextual-bandit warnings that adapt their timing and wording to what has worked for each student.
  4. A browser extension that reads the destination site so the confession is pre-filled.

## Limitations

- No real-user validation yet; all quantitative results are from simulation.
- Confessions are self-reported.
- The pooled warning-trial confidence interval treats decision points as independent; real data needs a
  repeated-measures analysis (above).
- The simulator shares the model's functional form, so the validation shows the estimators are correct and well
  calibrated under that form, not that the form is right for real people.

## Team contributions

- **ashank-crazy**: idea, design, implementation (app, analytics, validation), documentation.
- Built with help from Claude Code (Anthropic) as an AI pair-programmer.

## Prior work and acknowledgements

Gourdian's focus timer and pumpkin started as an entry to **Pumpkin Playground** (CSULB ACM, Nov 2026). The
analytics layer, risk model, randomized warnings, Insights page, synthetic data generator, tests and validation
study were built for DataNova. Fonts: Fraunces and DM Sans (Google Fonts, SIL Open Font License). No other
third-party code.

## References

- Boruvka, A., Almirall, D., Witkiewitz, K., & Murphy, S. A. (2018). Assessing time-varying causal effect moderation in mobile health. *Journal of the American Statistical Association*, 113(523), 1112–1121.
- Clayton, D., & Kaldor, J. (1987). Empirical Bayes estimates of age-standardized relative risks for use in disease mapping. *Biometrics*, 43(3), 671–681.
- Freireich, E. J., et al. (1963). The effect of 6-mercaptopurine on the duration of steroid-induced remissions in acute leukemia. *Blood*, 21(6), 699–716.
- Kaplan, E. L., & Meier, P. (1958). Nonparametric estimation from incomplete observations. *Journal of the American Statistical Association*, 53(282), 457–481.
- Klasnja, P., et al. (2015). Microrandomized trials: An experimental design for developing just-in-time adaptive interventions. *Health Psychology*, 34(S), 1220–1228.
- Mark, G., Gudith, D., & Klocke, U. (2008). The cost of interrupted work: More speed and stress. *Proceedings of CHI 2008*, 107–110.
- Nahum-Shani, I., et al. (2018). Just-in-time adaptive interventions (JITAIs) in mobile health. *Annals of Behavioral Medicine*, 52(6), 446–462.
- Singer, J. D., & Willett, J. B. (1993). It's about time: Using discrete-time survival analysis to study duration and the timing of events. *Journal of Educational Statistics*, 18(2), 155–195.
- Steel, P. (2007). The nature of procrastination: A meta-analytic and theoretical review of quintessential self-regulatory failure. *Psychological Bulletin*, 133(1), 65–94.

---

## How this maps to the judging criteria

| Criterion | Where to look |
| --- | --- |
| Innovation & originality (20%) | An n-of-1 micro-randomized trial inside a game; survival analysis turned into a timer setting; all on-device |
| Technical implementation (25%) | `js/insights.js` (from-scratch statistics), live risk meter, tests, CI before deploy |
| Problem relevance (15%) | Problem statement above; Open Innovation with an education / wellbeing focus |
| Data & analytical rigor (15%) | Censoring-aware survival, shrinkage, held-out evaluation, calibration, interval coverage, A/A check, [RESULTS.md](analysis/RESULTS.md) |
| Impact & feasibility (15%) | Live today, zero marginal cost, privacy by design, pilot plan |
| Presentation & documentation (10%) | This document, the README data dictionary, the deck, the demo |
