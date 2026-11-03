/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  GLOBAL GAME CONFIG
 * ─────────────────────────────────────────────────────────────────────────────
 *  This is the ONLY file a game designer needs to open to tune the game.
 *  Every gameplay number, emoji, color, on-screen text and layout offset
 *  lives here. Change a value, save — the dev server hot-reloads the game.
 *
 *  Sections:
 *    canvas      – window / canvas size and base background
 *    player      – the cat: emoji, speed, collision size, position
 *    item        – falling items: collision size, spawn position
 *    difficulty  – how fast the game ramps up over time
 *    scoring     – lives, points, damage
 *    combo       – consecutive-catch multiplier (step, cap, look)
 *    drops       – what falls from the sky and with what probability
 *    phases      – phase 1 → 2 (hell) → 3 (void) thresholds and look
 *    ui          – all texts, colors, font sizes and layout offsets
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const GAME_CONFIG = {
  canvas: {
    width: 600, // px
    height: 500, // px
    backgroundColor: "#87ceeb", // light blue sky
  },

  player: {
    emoji: "🐱",
    fontSize: "52px",
    speed: 440, // px/sec horizontal movement
    mouseLerpSpeed: 14, // how quickly the cat follows the mouse (per second)
    halfWidth: 26, // collision radius (px)
    yFromBottom: 52, // distance from the bottom edge (px)
  },

  item: {
    radius: 17, // collision radius (px)
    fontSize: "36px",
    spawnXMargin: 40, // min distance from left/right edges at spawn (px)
    spawnY: -20, // spawn point above the screen (px)
    despawnYOffset: 24, // how far below the screen before removal (px)
    magnetDurationMs: 5000, // how long the magnet power-up pulls food
    magnetPullSpeed: 300, // px/sec food drifts toward the cat while magnetic
    phase3DriftSpeed: 70, // max horizontal drift of phase 3 diagonal drops
  },

  difficulty: {
    baseFallSpeed: 150, // px/sec at game start
    maxFallSpeed: 650, // px/sec cap
    speedRampPerSecond: 4, // px/sec added to fall speed every second
    baseSpawnIntervalMs: 1000, // ms between drops at game start
    minSpawnIntervalMs: 320, // ms cap
    spawnIntervalRampPerSecond: 10, // ms removed from interval every second
  },

  scoring: {
    startLives: 10,
    foodScore: 1, // points for catching food
    starScore: 3, // points for catching a star (phase 2)
    bombDamage: 2, // lives lost when catching a bomb (phase 2)
    garbageDamage: 1, // lives lost when catching garbage
    missedFoodDamage: 0, // lives lost when food falls (0 = a miss only breaks the combo)
  },

  // Combo: consecutive food catches multiply the score; any damage or
  // missed food resets the streak.
  combo: {
    catchesPerStep: 3, // streak length needed for +1 multiplier
    maxMultiplier: 5,
    comboTextOffsetX: 160, // px to the right of the score text
    comboFontSize: "20px",
    comboColor: "#f97316",
    comboPulseScale: 1.35, // scale pulse when the multiplier grows
    comboPulseMs: 150,
  },

  drops: {
    garbageChance: 0.15, // phase 1: fraction of drops that are garbage
    bombChance: 0.1, // phase 2: fraction of drops that are bombs
    starChance: 0.1, // phase 2: fraction of drops that are bonus stars
    phase3BombChance: 0.15, // phase 3: bombs get more frequent
    phase3StarChance: 0.15, // phase 3: stars too — high risk, high reward
    phase3GarbageChance: 0.18, // phase 3: garbage rate
    magnetChance: 0.04, // power-up: pulls food toward the cat for a while
    shieldChance: 0.04, // power-up: absorbs one garbage/bomb hit
    foodEmojis: ["🍎", "🍕", "🍩", "🍇"],
    garbageEmoji: "🗑️",
    bombEmoji: "💣",
    starEmoji: "⭐",
    magnetEmoji: "🧲",
    shieldEmoji: "🛡️",
  },

  phases: {
    phase2ScoreThreshold: 20, // score needed to reach phase 2
    phase2WarningScore: 5, // warning shown this many points before the threshold
    phase3ScoreThreshold: 60, // score needed to reach phase 3
    phase3WarningScore: 5, // warning shown this many points before the threshold
    phase1Background: "#87ceeb", // light blue sky
    phase2Background: "#8b0000", // hell-red background
    phase3Background: "#1a0b2e", // deep void purple
    phase2Heart: "🖤", // lives hearts turn black in phase 2
    phase3Heart: "🖤", // and stay black in phase 3
    demonEmoji: "😈", // the cat turns into a demon in phase 2
    phase3Emoji: "👻", // and ascends into a spirit in phase 3
  },

  ui: {
    fontFamily: "system-ui, sans-serif",

    // HUD (top of the screen)
    scoreLabel: "Score: ",
    bestLabel: "Best: ",
    livesLabel: "Lives: ",
    heartEmoji: "❤️",
    shieldHudBadge: " 🛡️", // shown next to hearts while a shield is active
    deadEmoji: "💀",
    hudFontSize: "22px",
    hudY: 14, // top offset (px)
    scoreX: 20, // left offset (px)
    scoreColor: "#1e293b",
    livesColor: "#d6336c",

    // Controls hint (bottom of the screen)
    controlsHint: "← → / A D or mouse — move · Esc — pause · M — sound",
    controlsFontSize: "16px",
    controlsColor: "#64748b",
    controlsYFromBottom: 8, // distance from the bottom edge (px)

    // Pause overlay
    pauseOverlayAlpha: 0.6, // dimming of the pause overlay
    pauseTitle: "PAUSED",
    pauseTitleFontSize: "48px",
    pauseTitleColor: "#ffffff",
    pauseTitleYOffset: -40, // relative to screen center (px)
    pauseHint: "Press Esc to continue",
    pauseHintFontSize: "20px",
    pauseHintColor: "#94a3b8",
    pauseHintYOffset: 20, // relative to screen center (px)

    // Phase 2 warning
    phaseWarningText: "⚠️ PHASE 2 INCOMING ⚠️",
    phaseWarningFontSize: "34px",
    phaseWarningColor: "#fde047",
    phaseWarningYOffset: -60, // relative to screen center (px)
    phaseWarningMinAlpha: 0.3, // pulsing lower bound
    phaseWarningPulseMs: 450, // pulse duration

    // Phase 2 banner
    phase2BannerText: "🔥 PHASE 2 🔥",
    phase2BannerFontSize: "46px",
    phase2BannerColor: "#fde047",
    phase2BannerYOffset: -60, // start position relative to screen center (px)
    phase2BannerEndYOffset: -110, // end position relative to screen center (px)
    phase2BannerDurationMs: 1400, // fade-out duration

    // Phase 3 banner
    phase3BannerText: "👻 PHASE 3 👻",
    phase3BannerFontSize: "46px",
    phase3BannerColor: "#c4b5fd",

    // Game over screen
    overlayAlpha: 0.6, // dimming behind the game-over text
    gameOverTitle: "GAME OVER",
    gameOverRecordTitle: "🏆 NEW RECORD!", // shown instead when the best score is beaten
    gameOverTitleFontSize: "48px",
    gameOverTitleColor: "#f87171",
    gameOverTitleYOffset: -70, // relative to screen center (px)
    gameOverReasonFontSize: "22px",
    gameOverReasonColor: "#e2e8f0",
    gameOverScoreFontSize: "30px",
    gameOverScoreColor: "#ffffff",
    gameOverScoreYOffset: 56, // relative to screen center (px)
    gameOverBestYOffset: 88, // relative to screen center (px)
    gameOverBestColor: "#fde047",
    restartHint: "Press R or click to restart",
    restartHintFontSize: "20px",
    restartHintColor: "#94a3b8",
    restartHintYOffset: 128, // relative to screen center (px)
    gameOverReason: "The cat ran out of lives!",

    // Floating messages (above the cat)
    floatMessageFontSize: "20px",
    floatMessageYOffset: -40, // above the cat (px)
    floatMessageLift: 36, // how far the message floats up (px)
    floatMessageDurationMs: 700,
    catchFoodMessage: "+1",
    catchFoodColor: "#4ade80",
    catchStarMessage: "+3 ⭐",
    catchStarColor: "#facc15",
    bombMessage: "💥 bomb!",
    garbageMessage: "💔 garbage!",
    missedMessage: "💔 missed!",
    comboBreakMessage: "combo lost 💔",
    magnetMessage: "🧲 magnet!",
    shieldMessage: "🛡️ shield ready!",
    shieldBlockMessage: "🛡️ blocked!",
    soundOnMessage: "🔊 sound on",
    soundOffMessage: "🔇 muted",
    damageColor: "#f87171",

    // Effects
    bounceScale: 1.25, // cat scale when catching food/star
    bounceDurationMs: 130,
    flashColor: 0xff3333, // red screen flash on damage
    flashAlpha: 0.4,
    flashDurationMs: 240,
  },
} as const;
