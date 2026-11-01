# Devpost submission: Gourdian

Paste-ready copy for https://pumpkin-playground.devpost.com. Deadline: **Thu Nov 5, 2026, 11:59 PM PST**.
Voting runs Nov 6 to 8, so the live link has to stay up through then.

---

**Project name:** Gourdian

**Tagline (Elevator pitch):** The focus timer that rots when you procrastinate. Leave the tab and Jack the pumpkin grows mold. Come back and you have to confess.

**Try it out:** https://ashank-crazy.github.io/gourdian/
**Source:** https://github.com/ashank-crazy/gourdian

**Built with:** `html5` `css3` `javascript` `svg` `web-audio-api` `page-visibility-api` `web-workers` `canvas` `github-pages`

**Gallery (in this order):** `media/thumbnail.png` (also the cover image), `media/screenshot-confession.png`,
`media/screenshot-focus.png`, `media/report-card.png`, `media/obituary.png`, `media/screenshot-stats.png`,
`media/screenshot-graveyard.png`

---

## Inspiration

Every focus app tries to make you feel good about studying. That never worked on us. Guilt does. Specifically, guilt
toward a small orange vegetable who trusted you. It's spooky season, midterms are here, and we've all opened
"one quick YouTube video" in the middle of a problem set. So we gave that video a victim.

## What it does

Gourdian is a Pomodoro-style focus timer guarded by **Jack**, a jack-o'-lantern who watches your tab.

- **Stay on task** and Jack glows, heals, and slowly grows from a *Tiny Gourd* into a *Prize Pumpkin* (blue ribbon),
  an *Honor-Roll Pumpkin* (grad cap), and eventually *Gourd-zilla* (crown).
- **Leave the tab** and Jack starts rotting in real time. The color drains, mold spots pop up, the body sags, flies
  move in, and a puddle of goo spreads. The browser tab guilt-trips you while you're gone: "🎃 hey." → "🎃 you left me
  on read" → "🪰 a fly just moved in" → "💀 tell my seeds i loved them". Even the favicon rots in your tab bar.
- **Come back** and you have to confess. Pick where you went: Instagram, TikTok, YouTube, texting, games, shopping,
  a snack run, or "no idea, honestly." Jack responds to each one ("One video. It's always 'one video.'").
  If it was real work in another tab, say so, and Jack un-rots. That excuse works twice per session. After that
  Jack gets suspicious and only gives half credit.
- **Finish** and you get a graded report card, from **A+ Prize Pumpkin** down to **F Compost**, plus an optional
  5-minute break where Jack naps and you can scroll freely.
- **Let Jack hit 100% rot** and Jack dies. You get an obituary ("Death by 'just one video'. Survived by approximately
  500 seeds."), a tombstone in the **Graveyard**, and the next pumpkin, Jack II, inherits nothing but your reputation.
- **Stats** turns your confessions into a ranking of **Pumpkin Killers**, so you can see exactly where your study time
  goes. It also shows total focus, a day streak, and every session's grade.

Report cards and obituaries export as Instagram-story-sized images, so you can post your shame (or your A+).

## How we built it

It's a plain static site: HTML, CSS, and vanilla JavaScript modules, with no framework and no build step,
hosted on GitHub Pages.

- **Jack is 100% code.** A single function draws the pumpkin as SVG from three inputs: rot level, mood, and growth
  stage. Rot shifts the color palette, adds bruises, mold spots (with an SVG turbulence filter for fuzzy edges),
  sagging, flies on orbiting paths, and goo. Eight carved faces cover the moods: happy, focused, suspicious, sad,
  horrified, celebrating, sleeping, dead. The face drifts toward your cursor, so Jack is always watching.
- **Leaving and returning** use the Page Visibility API. Browsers throttle timers in background tabs, so the clock
  runs in a tiny Web Worker that keeps ticking while you're gone.
- **The favicon** is redrawn on a canvas as Jack rots, with a ring that shows session progress.
- **Sound effects** (start chime, poke squish, sad trombone on death) are synthesized live with the Web Audio API.
- **Share cards** are drawn on a canvas, with the same SVG Jack rendered into them.
- **No accounts and no tracking.** Everything lives in `localStorage` on your device.

## Challenges we ran into

- **Honest procrastination vs. real work.** A tab-watcher can't tell YouTube from Google Docs. Instead of a blocklist
  or a browser extension, we went with the honor system plus suspicion: confess, and real work gets excused, but
  only twice per session before Jack starts squinting.
- **Background tabs.** Browsers slow timers in hidden tabs down to once a minute, which broke the live rot and the
  guilt-trip titles. Moving the tick into a Web Worker fixed it.
- **Making rot look gross and still readable.** Early versions just faded Jack out. We had to tune color easing (so
  even 5% rot is visible), spot timing, and face brightness so a dying Jack is still expressive.
- **One drawing for everything.** The share cards draw the SVG as a standalone image, and that's strict XML: an HTML
  shortcut that worked fine on the page broke the export. Now one renderer serves the page, the graveyard, the cards,
  and the favicon.

## Accomplishments that we're proud of

- The tab title and favicon guilt-trip you **while you're on another site**, which is where the procrastinating
  actually happens.
- Jack has a lot of personality from pure code: 140+ lines of dialogue, eight faces, six growth stages.
- It's genuinely useful: a real Pomodoro timer with breaks, notifications, session history, and a distraction
  breakdown that tells you something true about your habits.
- Works on phones too. Switching apps counts as leaving.

## What we learned

The Page Visibility API, Web Workers for timing, generating SVG procedurally, and canvas image export. Also that a
pumpkin saying "I grew a spot. I named it after you." works better on us than any productivity streak.

## What's next for Gourdian

- **Study-group patches:** friends' pumpkins in one shared patch, so everyone can see whose Jack is rotting.
- A browser extension that knows which site you went to, so the confession comes pre-filled. (Jack still judges.)
- Seasonal skins: a winter gourd, a spring squash, a summer watermelon that gets sunburnt.
- An "exam week" mode with harsher rot and more dramatic eulogies.

---

## Category tracks

Vote targets: **General (Most Popular)**, **Most Useful**, and **Fall Themed**. Gourdian fits all three: it's a joke
with a working focus timer underneath, and it's a pumpkin.

## Demo video tips (optional)

Open `https://ashank-crazy.github.io/gourdian/?demo` to record. Rot is 5× faster and there's a 10-second session.
Shot list: start a session → switch to TikTok for about 20 s (show the tab title changing) → come back to a moldy
Jack → confess "TikTok" → finish and show the report card → let a pumpkin die → show the obituary and graveyard.
