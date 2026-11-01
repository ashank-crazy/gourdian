// Everything Jack says, plus the tables the app reads (grades, stages, causes of death).
// Lines avoid pronouns for the pumpkin so they still read right after a rename.

export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const fill = (str, vars = {}) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export const CULPRITS = [
  { key: 'instagram', emoji: '📸', label: 'Instagram' },
  { key: 'tiktok', emoji: '🎵', label: 'TikTok / Reels' },
  { key: 'youtube', emoji: '▶️', label: 'YouTube' },
  { key: 'texting', emoji: '💬', label: 'Texting' },
  { key: 'games', emoji: '🎮', label: 'Games' },
  { key: 'shopping', emoji: '🛒', label: 'Shopping' },
  { key: 'snack', emoji: '🍿', label: 'Snack run' },
  { key: 'void', emoji: '🌀', label: 'No idea, honestly' },
];

export const CAUSES = {
  instagram: 'Death by Instagram',
  tiktok: 'Death by doomscrolling',
  youtube: 'Death by “just one video”',
  texting: 'Death by group chat',
  games: 'Death by “one more round”',
  shopping: 'Death by add-to-cart',
  snack: 'Death by snack run',
  void: 'Death by the void',
  work: 'Death by “working, I swear”',
  neglect: 'Death by neglect',
  abandonment: 'Death by abandonment',
};

// min is focus minutes for that pumpkin's lifetime
export const STAGES = [
  { min: 0, name: 'Tiny Gourd' },
  { min: 30, name: 'Pie Pumpkin' },
  { min: 90, name: "Jack-o'-Lantern" },
  { min: 240, name: 'Prize Pumpkin' },
  { min: 600, name: 'Honor-Roll Pumpkin' },
  { min: 1500, name: 'Gourd-zilla' },
];

// min is the share of the session spent here (or excused)
export const GRADES = [
  { min: 0.99, letter: 'A+', name: 'Prize Pumpkin', note: 'Flawless. Not a single tab betrayed.' },
  { min: 0.95, letter: 'A', name: 'Fresh Picked', note: 'Basically perfect. {name} is glowing. Literally.' },
  { min: 0.85, letter: 'B', name: 'Slightly Bruised', note: 'Solid work with a couple of detours.' },
  { min: 0.7, letter: 'C', name: 'Soft Spot', note: 'You got there. {name} has notes.' },
  { min: 0.5, letter: 'D', name: 'Pie Filling', note: 'Half work, half wandering.' },
  { min: 0, letter: 'F', name: 'Compost', note: 'The session technically happened near you.' },
];

export const FRESHNESS = [
  { min: 90, label: 'Farm fresh' },
  { min: 70, label: 'Crisp' },
  { min: 50, label: 'A little soft' },
  { min: 30, label: 'Questionable' },
  { min: 10, label: 'Biohazard' },
  { min: 1, label: 'On its last stem' },
  { min: 0, label: 'Compost' },
];

export const EPITAPHS = [
  'Mostly water. Entirely ours.',
  'Gone, but not composted. (Okay, composted.)',
  '{name} watched so you didn\'t have to.',
  'Survived by approximately 500 seeds.',
  '{name} believed in you. Mistakes were made.',
  'Rest in pieces. Pie pieces.',
  'Never once asked for a grade bump.',
  'Lit from within. Rotted from without.',
  'Carved with love. Abandoned for a group chat.',
];

export const LINES = {
  idle: [
    "I'm a pumpkin. You're a student. Let's both pretend we have it together.",
    "Pick a task. I'll watch. Menacingly.",
    'My whole personality is that I rot when you procrastinate. No pressure.',
    "Fun fact: I'm 90% water and 10% judgment.",
    'Your syllabus called. It sounded worried.',
    'Start a session and I guard your focus. Like a gargoyle, but squishier.',
    'Midterms are a social construct. Deadlines, sadly, are not.',
  ],
  welcomeBack: [
    'Oh hey, you came back. On purpose this time?',
    'Welcome back. I kept the candle lit for you.',
    "Ready for round two? I've been doing gourd-stretches.",
  ],
  start: [
    "Timer's on. I'm watching. Don't make it weird.",
    'Okay. Eyes on the work. My eyes are on you.',
    'Go. If you leave this tab, I start composting.',
    'Focus mode: engaged. Snack thoughts: denied.',
    'Remember: every new tab is a tiny betrayal.',
  ],
  resumeSession: [
    'We were in the middle of something. Remember?',
    'The timer kept going while you were gone. So did I.',
  ],
  focusing: [
    "You're doing great. I'm doing great. Two gourds in a pod.",
    "This is the most attention anyone's paid to anything in years.",
    "Lookin' fresh. Me, I mean. But also you.",
    'I can feel my insides getting firmer. That is a compliment.',
    'Every minute you focus, a squirrel somewhere loses interest in me.',
    'Keep going. Future you is writing present you a thank-you card.',
    "I'd high-five you but I'm a sphere.",
    "Shh. I'm being proud of you quietly.",
    'If productivity had a smell, you would smell like cinnamon.',
    'Your GPA just looked up from its phone.',
    'Still here. Still glowing. Still not a pie.',
  ],
  halfway: [
    "Halfway there. I'm so firm right now.",
    'Half done! I would do a little dance if I had any bones.',
  ],
  lastMinute: [
    "One minute left. Don't you dare leave now.",
    'Final minute. I can see the finish line. It looks like a pie tin, but in a good way.',
  ],
  peek: [
    'Quick peek. I saw that.',
    "That was fast. I'm choosing not to ask.",
    'Tab out, tab in. Very smooth. Very suspicious.',
  ],
  returnShort: [
    'You were gone {t}. I felt every second.',
    '{t}. Long enough to grow feelings. And spores.',
    'Oh, you\'re back. After {t}. Cool. Cool cool cool.',
  ],
  returnMed: [
    '{t}. I grew a spot. I named it after you.',
    'You left for {t}. A fruit fly proposed to me.',
    "{t}?? I've been through things. Squishy things.",
  ],
  returnLong: [
    "{t}. I've seen the other side. It's mostly mulch.",
    'You were gone {t}. I wrote a will. You are not in it.',
    "{t}. I'm not angry. I'm just... soft.",
  ],
  confess: {
    instagram: ["Ah yes. Looking at other people's pumpkins.", "Did you at least like my cousin's post?"],
    tiktok: ['Your attention span is shorter than my stem.', 'Swipe. Swipe. Rot. Swipe.'],
    youtube: ["One video. It's always 'one video.'", 'Did you learn anything? Was it about pumpkins? No? Hmm.'],
    texting: ['Tell them {name} says hi. And that you are studying. Allegedly.', "Was it important? It was a meme, wasn't it."],
    games: ["'One more round.' I've heard that one.", 'Did you win? Because I lost. Freshness, mostly.'],
    shopping: ['Add to cart: one (1) fresh pumpkin. To replace me.', 'Nothing in that cart is a passing grade.'],
    snack: ['Valid. Unless it was pumpkin pie. Then we need to talk.', 'Snacks are fuel. I respect it. The rot stays though.'],
    void: ["Honestly? Relatable. I don't know where my insides went either.", 'The void called. You picked up. Classic.'],
    work: ["Legit work. Sure. I'll un-rot. I'm choosing to believe you.", 'Studying in another tab? Respect. Rot reversed.'],
  },
  workSus: [
    "That's {n} 'work' trips. I'll un-rot half. I'm squinting.",
    'Work again? I believe you 50%. Half the rot stays.',
  ],
  pause: ["Paused. I'll hold still. I'm good at that.", 'Pause button pressed. Freshness frozen. Judgment ongoing.'],
  resume: ['And we\'re back. Eyes forward.', 'Unpaused. Let\'s finish this.'],
  complete: [
    "WE DID IT. I'm firmer, fresher, and frankly emotional.",
    'Session complete! Somewhere, a pie just got cancelled in my honor.',
    'Look at you, finishing things. Who ARE you?',
    "That's a wrap. I'd hug you but I'd leave a stain.",
  ],
  stageUp: ['I grew into a {stage}! Look at me. LOOK AT ME.'],
  breakStart: ["Break time. Go scroll. It's legal now.", "Zzz... wake me when it's study time."],
  breakEnd: ["Break's over. Ready when you are. (Be ready.)", 'I napped. You snacked. Back to it.'],
  abandon: [
    "You're quitting? I'm literally going to rot about this.",
    'Fine. Leave. I\'ll just be here. Decomposing. Emotionally and physically.',
  ],
  decay: [
    "It's been {n}. I've... changed.",
    '{n} without a session. Something moved inside me. Not in a good way.',
    "Oh. You're back. After {n}. Don't look at my left side.",
  ],
  death: [
    '{name} has passed.',
    'And just like that, {name} became compost.',
  ],
  dead: [
    "({name} can't hear you. {name} is compost now. Plant a new one.)",
    '(There is a pumpkin-shaped hole in your heart. Plant a new one.)',
  ],
  newPumpkin: [
    "Hi! I'm {name}. I've heard things about what happened to the last one.",
    "{name} here. Fresh off the vine. Please don't make me a statistic.",
    "Hello! I'm {name}. I read the graveyard on the way in. We're going to be fine. Right?",
  ],
  poke: [
    'Ow. I bruise easily.',
    'Please do not poke the produce.',
    "That tickles. Also: shouldn't you be working?",
    'Boop received. Productivity not received.',
    'I am a precision focus instrument. Not a stress ball.',
    "Poke me again and I'm telling your advisor.",
  ],
  pokeSleep: ['Mmf... five more minutes.', 'Zzz... *rolls over*', "I'm on break. Union rules."],
  pokeDead: ['...', '(no response)', '(a fly buzzes away)'],
  nag: [
    "I'm rotting. Just thought you should know.",
    'Something is growing on me. Please come back.',
    'Hello?? The timer is still running.',
  ],
  denied: ['Your browser said no. {name} respects boundaries.'],
  notifyOn: ["Notifications on. I'll nag you if you wander off. Lovingly."],
  // tab titles while away, keyed by seconds gone
  titles: [
    [0, '🎃 hey.'],
    [6, '🎃 hello??'],
    [15, '🎃 you left me on read'],
    [30, '🍂 i can feel myself getting soft'],
    [60, '🦠 something is growing on me'],
    [120, '🪰 a fly just moved in'],
    [200, '🪰🪰 the fly brought friends'],
    [300, '🥧 this is how pies are made'],
    [420, '💀 tell my seeds i loved them'],
    [600, '⚰️ rest in pieces'],
  ],
};
