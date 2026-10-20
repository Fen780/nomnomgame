import Phaser from "phaser";
<<<<<<< HEAD
import { GAME_CONFIG } from "./gameConfig";
import { pickItem } from "./items";
import type { FallingItem, ItemKind } from "./types";
=======

// ── Gameplay parameters (tune here) ─────────────────────────────────────────
const PLAYER_SPEED = 340; // px/sec horizontal cat movement
const PLAYER_HALF_WIDTH = 26; // collision radius of the cat
const ITEM_RADIUS = 17; // collision radius of a falling item

const BASE_FALL_SPEED = 150; // px/sec at game start
const MAX_FALL_SPEED = 650; // px/sec cap
const SPEED_RAMP_PER_SECOND = 6; // px/sec added to fall speed every second

const BASE_SPAWN_INTERVAL_MS = 1000; // ms between drops at game start
const MIN_SPAWN_INTERVAL_MS = 320; // ms cap
const SPAWN_INTERVAL_RAMP_PER_SECOND = 10; // ms removed from interval every second

const START_LIVES = 10;
const GARBAGE_CHANCE = 0.22; // fraction of drops that are garbage
const FOOD_EMOJIS = ["🍎", "🍕", "🍩", "🍇"] as const;
const GARBAGE_EMOJI = "🗑️";
const PAUSE_OVERLAY_ALPHA = 0.6; // dimming of the pause overlay

// ── Phase 2 (hell mode) ─────────────────────────────────────────────────────
const PHASE_2_SCORE_THRESHOLD = 20; // score needed to reach phase 2
const PHASE_2_WARNING_SCORE = 5; // warning shown this many points before the threshold
const BOMB_CHANCE = 0.1; // phase 2: fraction of drops that are bombs
const STAR_CHANCE = 0.1; // phase 2: fraction of drops that are bonus stars
const BOMB_EMOJI = "💣";
const STAR_EMOJI = "⭐";
const DEMON_EMOJI = "😈"; // the cat turns into a demon in phase 2
const PHASE_1_BACKGROUND = "#87ceeb"; // light blue sky (phase 1)
const PHASE_2_BACKGROUND = "#8b0000"; // hell-red background (phase 2)
const PHASE_2_HEART = "🖤"; // lives hearts turn black in phase 2

type ItemKind = "food" | "garbage" | "bomb" | "star";

interface FallingItem {
  sprite: Phaser.GameObjects.Text;
  kind: ItemKind;
}
>>>>>>> 89b6d45cafa175e742379ffec5e5c9f7eeb3c56a

/**
 * "Hungry Cat" — a cat catches food falling from the sky.
 *
 * - Catch food: +1 score.
 * - Catch garbage: lose a life.
 * - Let food fall to the ground: lose a life.
 * - 10 lives in total; game over when they run out (10 missed foods = instant loss).
 * - Fall speed and spawn rate grow while you play.
 *
 * All tunable values live in `gameConfig.ts` — a game designer can change
 * numbers, emojis, colors and texts there without touching this file.
 */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"left" | "right", Phaser.Input.Keyboard.Key>;
  private items: FallingItem[] = [];

  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;

  private score = 0;
  private lives = GAME_CONFIG.scoring.startLives;
  private elapsed = 0; // seconds since game start
  private spawnTimer = 0; // ms accumulated toward the next drop
  private gameOver = false;
  private paused = false;
  private phase: 1 | 2 = 1;
  private phaseWarningShown = false;
  private phaseWarning: Phaser.GameObjects.Text | null = null;
  private pauseOverlay!: Phaser.GameObjects.Rectangle;
  private pauseTitle!: Phaser.GameObjects.Text;
  private pauseHint!: Phaser.GameObjects.Text;

  constructor() {
    super("GameScene");
  }

  create(): void {
    const { width, height } = this.scale;
    const { ui, player, phases } = GAME_CONFIG;

    // Reset everything (scene.restart() reuses this instance).
    this.items = [];
    this.score = 0;
    this.lives = GAME_CONFIG.scoring.startLives;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.gameOver = false;
    this.paused = false;
    this.phase = 1;
    this.phaseWarningShown = false;
    this.phaseWarning = null;
    this.cameras.main.setBackgroundColor(phases.phase1Background);

    this.player = this.add
      .text(width / 2, height - player.yFromBottom, player.emoji, {
        fontSize: player.fontSize,
      })
      .setOrigin(0.5);

    this.scoreText = this.add.text(ui.scoreX, ui.hudY, "", {
      fontFamily: ui.fontFamily,
      fontSize: ui.hudFontSize,
      color: ui.scoreColor,
    });

    this.livesText = this.add
      .text(width / 2, ui.hudY, "", {
        fontFamily: ui.fontFamily,
        fontSize: ui.hudFontSize,
        color: ui.livesColor,
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width / 2, height - ui.controlsYFromBottom, ui.controlsHint, {
        fontFamily: ui.fontFamily,
        fontSize: ui.controlsFontSize,
        color: ui.controlsColor,
      })
      .setOrigin(0.5, 1);

    // Pause overlay: created once, shown/hidden on Esc (no per-toggle allocations).
    this.pauseOverlay = this.add
      .rectangle(
        width / 2,
        height / 2,
        width,
        height,
        0x000000,
        ui.pauseOverlayAlpha,
      )
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    this.pauseTitle = this.add
      .text(width / 2, height / 2 + ui.pauseTitleYOffset, ui.pauseTitle, {
        fontFamily: ui.fontFamily,
        fontSize: ui.pauseTitleFontSize,
        color: ui.pauseTitleColor,
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false);

    this.pauseHint = this.add
      .text(width / 2, height / 2 + ui.pauseHintYOffset, ui.pauseHint, {
        fontFamily: ui.fontFamily,
        fontSize: ui.pauseHintFontSize,
        color: ui.pauseHintColor,
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false);

    this.updateHud();

    if (!this.input.keyboard) {
      throw new Error("Keyboard input is unavailable.");
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<"left" | "right", Phaser.Input.Keyboard.Key>;

    this.input.keyboard.on("keydown-ESC", () => this.togglePause());
  }

  update(_time: number, delta: number): void {
    if (this.gameOver || this.paused) return;

    const seconds = delta / 1000;
    this.elapsed += seconds;

    this.updatePhase();

    const { difficulty } = GAME_CONFIG;
    const fallSpeed = Math.min(
      difficulty.baseFallSpeed + this.elapsed * difficulty.speedRampPerSecond,
      difficulty.maxFallSpeed,
    );
    const spawnInterval = Math.max(
      difficulty.baseSpawnIntervalMs -
        this.elapsed * difficulty.spawnIntervalRampPerSecond,
      difficulty.minSpawnIntervalMs,
    );

    this.movePlayer(seconds);
    this.moveItems(fallSpeed, seconds);

    this.spawnTimer += delta;
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer -= spawnInterval;
      this.spawnItem();
    }
  }

  private togglePause(): void {
    if (this.gameOver) return;

    this.paused = !this.paused;
    this.pauseOverlay.setVisible(this.paused);
    this.pauseTitle.setVisible(this.paused);
    this.pauseHint.setVisible(this.paused);
  }

  private updatePhase(): void {
    if (this.phase !== 1) return;

    const { phases } = GAME_CONFIG;
    if (
      !this.phaseWarningShown &&
<<<<<<< HEAD
      this.score >= phases.phase2ScoreThreshold - phases.phase2WarningScore
=======
      this.score >= PHASE_2_SCORE_THRESHOLD - PHASE_2_WARNING_SCORE
>>>>>>> 89b6d45cafa175e742379ffec5e5c9f7eeb3c56a
    ) {
      this.phaseWarningShown = true;
      this.showPhaseWarning();
    }

<<<<<<< HEAD
    if (this.score >= phases.phase2ScoreThreshold) {
=======
    if (this.score >= PHASE_2_SCORE_THRESHOLD) {
>>>>>>> 89b6d45cafa175e742379ffec5e5c9f7eeb3c56a
      this.startPhase2();
    }
  }

  private showPhaseWarning(): void {
    const { width, height } = this.scale;
    const { ui } = GAME_CONFIG;
    this.phaseWarning = this.add
      .text(
        width / 2,
        height / 2 + ui.phaseWarningYOffset,
        ui.phaseWarningText,
        {
          fontFamily: ui.fontFamily,
          fontSize: ui.phaseWarningFontSize,
          color: ui.phaseWarningColor,
          fontStyle: "bold",
        },
      )
      .setOrigin(0.5)
      .setDepth(15);

    this.tweens.add({
      targets: this.phaseWarning,
      alpha: ui.phaseWarningMinAlpha,
      duration: ui.phaseWarningPulseMs,
      yoyo: true,
      repeat: -1,
    });
  }

  private startPhase2(): void {
    this.phase = 2;

    if (this.phaseWarning) {
      this.tweens.killTweensOf(this.phaseWarning);
      this.phaseWarning.destroy();
      this.phaseWarning = null;
    }

    // Hell atmosphere: red sky, demon cat, black hearts.
    const { phases, ui } = GAME_CONFIG;
    this.cameras.main.setBackgroundColor(phases.phase2Background);
    this.player.setText(phases.demonEmoji);
    this.updateHud();

    const { width, height } = this.scale;
    const banner = this.add
      .text(
        width / 2,
        height / 2 + ui.phase2BannerYOffset,
        ui.phase2BannerText,
        {
          fontFamily: ui.fontFamily,
          fontSize: ui.phase2BannerFontSize,
          color: ui.phase2BannerColor,
          fontStyle: "bold",
        },
      )
      .setOrigin(0.5)
      .setDepth(15);

    this.tweens.add({
      targets: banner,
      alpha: 0,
      y: height / 2 + ui.phase2BannerEndYOffset,
      duration: ui.phase2BannerDurationMs,
      ease: "Cubic.easeOut",
      onComplete: () => banner.destroy(),
    });
  }

  private movePlayer(seconds: number): void {
    const { player } = GAME_CONFIG;
    let dx = 0;
    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;

    this.player.x += dx * player.speed * seconds;
    this.player.x = Phaser.Math.Clamp(
      this.player.x,
      player.halfWidth,
      this.scale.width - player.halfWidth,
    );
  }

  private moveItems(fallSpeed: number, seconds: number): void {
    const { player, item } = GAME_CONFIG;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const fallingItem = this.items[i];
      fallingItem.sprite.y += fallSpeed * seconds;

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        fallingItem.sprite.x,
        fallingItem.sprite.y,
      );

      if (distance <= player.halfWidth + item.radius) {
        this.removeItem(i);
        this.onCatch(fallingItem.kind);
        continue;
      }

      if (fallingItem.sprite.y > this.scale.height + item.despawnYOffset) {
        this.removeItem(i);
        if (fallingItem.kind === "food") this.onFoodMissed();
      }
    }
  }

  private removeItem(index: number): void {
    const [fallingItem] = this.items.splice(index, 1);
    fallingItem.sprite.destroy();
  }

  private spawnItem(): void {
    const { width } = this.scale;
    const { item } = GAME_CONFIG;
    const { kind, emoji } = pickItem(this.phase, Math.random());

    const sprite = this.add
      .text(
        Phaser.Math.Between(item.spawnXMargin, width - item.spawnXMargin),
        item.spawnY,
        emoji,
        { fontSize: item.fontSize },
      )
      .setOrigin(0.5);

    this.items.push({ sprite, kind });
  }

  private onCatch(kind: ItemKind): void {
    const { scoring, ui } = GAME_CONFIG;

    if (kind === "food") {
      this.score += scoring.foodScore;
      this.updateHud();
      this.floatMessage(
        ui.catchFoodMessage,
        this.player.x,
        this.player.y + ui.floatMessageYOffset,
        ui.catchFoodColor,
      );
      this.bouncePlayer();
      return;
    }

    if (kind === "star") {
      this.score += scoring.starScore;
      this.updateHud();
      this.floatMessage(
        ui.catchStarMessage,
        this.player.x,
        this.player.y + ui.floatMessageYOffset,
        ui.catchStarColor,
      );
      this.bouncePlayer();
      return;
    }

    if (kind === "bomb") {
      this.lives -= scoring.bombDamage;
      this.updateHud();
      this.flashRed();
      this.floatMessage(
        ui.bombMessage,
        this.player.x,
        this.player.y + ui.floatMessageYOffset,
        ui.damageColor,
      );
      this.checkDefeat();
      return;
    }

    this.lives -= scoring.garbageDamage;
    this.updateHud();
    this.flashRed();
    this.floatMessage(
      ui.garbageMessage,
      this.player.x,
      this.player.y + ui.floatMessageYOffset,
      ui.damageColor,
    );
    this.checkDefeat();
  }

  private bouncePlayer(): void {
    const { ui } = GAME_CONFIG;
    this.player.setScale(ui.bounceScale);
    this.tweens.add({
      targets: this.player,
      scale: 1,
      duration: ui.bounceDurationMs,
      ease: "Back.out",
    });
  }

  private onFoodMissed(): void {
    const { scoring, ui } = GAME_CONFIG;
    this.lives -= scoring.missedFoodDamage;
    this.updateHud();
    this.floatMessage(
      ui.missedMessage,
      this.player.x,
      this.player.y + ui.floatMessageYOffset,
      ui.damageColor,
    );
    this.checkDefeat();
  }

  private checkDefeat(): void {
    if (this.lives <= 0) {
      this.endGame(GAME_CONFIG.ui.gameOverReason);
    }
  }

  private endGame(reason: string): void {
    this.gameOver = true;
    const { width, height } = this.scale;
    const { ui } = GAME_CONFIG;

    this.add
      .rectangle(
        width / 2,
        height / 2,
        width,
        height,
        0x000000,
        ui.overlayAlpha,
      )
      .setOrigin(0.5)
      .setDepth(20);

    this.add
      .text(width / 2, height / 2 + ui.gameOverTitleYOffset, ui.gameOverTitle, {
        fontFamily: ui.fontFamily,
        fontSize: ui.gameOverTitleFontSize,
        color: ui.gameOverTitleColor,
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.add
      .text(width / 2, height / 2, reason, {
        fontFamily: ui.fontFamily,
        fontSize: ui.gameOverReasonFontSize,
        color: ui.gameOverReasonColor,
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.add
      .text(
        width / 2,
        height / 2 + ui.gameOverScoreYOffset,
        `${ui.scoreLabel}${this.score}`,
        {
          fontFamily: ui.fontFamily,
          fontSize: ui.gameOverScoreFontSize,
          color: ui.gameOverScoreColor,
        },
      )
      .setOrigin(0.5)
      .setDepth(21);

    this.add
      .text(width / 2, height / 2 + ui.restartHintYOffset, ui.restartHint, {
        fontFamily: ui.fontFamily,
        fontSize: ui.restartHintFontSize,
        color: ui.restartHintColor,
      })
      .setOrigin(0.5)
      .setDepth(21);

    if (this.input.keyboard) {
      this.input.keyboard.once("keydown-R", () => this.scene.restart());
    }
    this.input.once("pointerdown", () => this.scene.restart());
  }

  private updateHud(): void {
    const { ui, phases } = GAME_CONFIG;
    this.scoreText.setText(`${ui.scoreLabel}${this.score}`);
    const heart = this.phase === 2 ? phases.phase2Heart : ui.heartEmoji;
    this.livesText.setText(
      `${ui.livesLabel}${heart.repeat(Math.max(0, this.lives)) || ui.deadEmoji}`,
    );
  }

  private flashRed(): void {
    const { width, height } = this.scale;
    const { ui } = GAME_CONFIG;
    const flash = this.add
      .rectangle(0, 0, width, height, ui.flashColor, ui.flashAlpha)
      .setOrigin(0);
    flash.setDepth(10);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: ui.flashDurationMs,
      onComplete: () => flash.destroy(),
    });
  }

  private floatMessage(
    text: string,
    x: number,
    y: number,
    color: string,
  ): void {
    const { ui } = GAME_CONFIG;
    const label = this.add
      .text(x, y, text, {
        fontFamily: ui.fontFamily,
        fontSize: ui.floatMessageFontSize,
        color,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: label,
      y: y - ui.floatMessageLift,
      alpha: 0,
      duration: ui.floatMessageDurationMs,
      onComplete: () => label.destroy(),
    });
  }
}
