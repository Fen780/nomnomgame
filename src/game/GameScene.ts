import Phaser from "phaser";
import { GAME_CONFIG } from "./gameConfig";
import { pickItem } from "./items";
import { sfx } from "./sounds";
import type { FallingItem, ItemKind } from "./types";

/**
 * "Hungry Cat" — a cat catches food falling from the sky.
 *
 * - Catch food: +1 × combo multiplier (the streak grows every few catches).
 * - Catch stars: +3. Catch magnets/shields: power-ups.
 * - Catch garbage or bombs: lose lives (a shield absorbs one hit).
 * - Let food fall to the ground: the combo breaks (no lives lost).
 * - Phase 2 (score 20): hell mode. Phase 3 (score 60): the void — diagonal drops.
 * - The best score is saved to localStorage.
 *
 * All tunable values live in `gameConfig.ts` — a game designer can change
 * numbers, emojis, colors and texts there without touching this file.
 */
export class GameScene extends Phaser.Scene {
  private static readonly BEST_KEY = "hungry-cat-best";

  private player!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"left" | "right", Phaser.Input.Keyboard.Key>;
  private items: FallingItem[] = [];

  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;

  private score = 0;
  private best = 0;
  private lives = GAME_CONFIG.scoring.startLives;
  private combo = 0;
  private comboMultiplier = 1;
  private shieldActive = false;
  private magnetMsLeft = 0;

  private elapsed = 0; // seconds since game start
  private spawnTimer = 0; // ms accumulated toward the next drop
  private gameOver = false;
  private paused = false;
  private phase: 1 | 2 | 3 = 1;
  private phaseWarningShown = false;
  private phaseWarning: Phaser.GameObjects.Text | null = null;
  private pointerTargetX: number | null = null;
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
    this.best = this.loadBest();
    this.lives = GAME_CONFIG.scoring.startLives;
    this.combo = 0;
    this.comboMultiplier = 1;
    this.shieldActive = false;
    this.magnetMsLeft = 0;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.gameOver = false;
    this.paused = false;
    this.phase = 1;
    this.phaseWarningShown = false;
    this.phaseWarning = null;
    this.pointerTargetX = null;
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

    this.comboText = this.add
      .text(ui.scoreX + GAME_CONFIG.combo.comboTextOffsetX, ui.hudY, "", {
        fontFamily: ui.fontFamily,
        fontSize: GAME_CONFIG.combo.comboFontSize,
        color: GAME_CONFIG.combo.comboColor,
      })
      .setVisible(false);

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
    this.input.keyboard.on("keydown-M", () => this.toggleMute());

    // Mouse / touch: the cat drifts toward the pointer.
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.gameOver && !this.paused) this.pointerTargetX = pointer.x;
    });
  }

  update(_time: number, delta: number): void {
    if (this.gameOver || this.paused) return;

    const seconds = delta / 1000;
    this.elapsed += seconds;
    if (this.magnetMsLeft > 0) {
      this.magnetMsLeft = Math.max(0, this.magnetMsLeft - delta);
    }

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

  private toggleMute(): void {
    const { ui } = GAME_CONFIG;
    const muted = sfx.toggleMute();
    this.floatMessage(
      muted ? ui.soundOffMessage : ui.soundOnMessage,
      this.scale.width / 2,
      this.scale.height / 2,
      ui.pauseHintColor,
    );
  }

  private updatePhase(): void {
    if (this.phase === 3) return;

    const { phases } = GAME_CONFIG;
    const threshold =
      this.phase === 1
        ? phases.phase2ScoreThreshold
        : phases.phase3ScoreThreshold;
    const warningScore =
      this.phase === 1 ? phases.phase2WarningScore : phases.phase3WarningScore;

    if (!this.phaseWarningShown && this.score >= threshold - warningScore) {
      this.phaseWarningShown = true;
      this.showPhaseWarning();
    }

    if (this.score >= threshold) {
      this.phaseWarningShown = false;
      this.startPhase(this.phase === 1 ? 2 : 3);
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

  private startPhase(next: 2 | 3): void {
    this.phase = next;

    if (this.phaseWarning) {
      this.tweens.killTweensOf(this.phaseWarning);
      this.phaseWarning.destroy();
      this.phaseWarning = null;
    }

    const { phases, ui } = GAME_CONFIG;
    this.cameras.main.setBackgroundColor(
      next === 2 ? phases.phase2Background : phases.phase3Background,
    );
    this.player.setText(next === 2 ? phases.demonEmoji : phases.phase3Emoji);
    this.updateHud();
    sfx.phaseUp();

    const { width, height } = this.scale;
    const banner = this.add
      .text(
        width / 2,
        height / 2 + ui.phase2BannerYOffset,
        next === 2 ? ui.phase2BannerText : ui.phase3BannerText,
        {
          fontFamily: ui.fontFamily,
          fontSize:
            next === 2 ? ui.phase2BannerFontSize : ui.phase3BannerFontSize,
          color: next === 2 ? ui.phase2BannerColor : ui.phase3BannerColor,
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

    if (dx !== 0) {
      // Keyboard takes priority; the mouse target is dropped until it moves again.
      this.pointerTargetX = null;
      this.player.x += dx * player.speed * seconds;
    } else if (this.pointerTargetX !== null) {
      const t = Math.min(1, player.mouseLerpSpeed * seconds);
      this.player.x += (this.pointerTargetX - this.player.x) * t;
    }

    this.player.x = Phaser.Math.Clamp(
      this.player.x,
      player.halfWidth,
      this.scale.width - player.halfWidth,
    );
  }

  private moveItems(fallSpeed: number, seconds: number): void {
    const { player, item } = GAME_CONFIG;
    const magnetActive = this.magnetMsLeft > 0;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const fallingItem = this.items[i];
      fallingItem.sprite.y += fallSpeed * seconds;

      // Phase 3 diagonal drops drift sideways and bounce off the walls.
      if (fallingItem.vx !== 0) {
        fallingItem.sprite.x += fallingItem.vx * seconds;
        if (
          fallingItem.sprite.x < item.spawnXMargin ||
          fallingItem.sprite.x > this.scale.width - item.spawnXMargin
        ) {
          fallingItem.sprite.x = Phaser.Math.Clamp(
            fallingItem.sprite.x,
            item.spawnXMargin,
            this.scale.width - item.spawnXMargin,
          );
          fallingItem.vx *= -1;
        }
      }

      // Magnet power-up: food drifts toward the cat.
      if (magnetActive && fallingItem.kind === "food") {
        const step = item.magnetPullSpeed * seconds;
        fallingItem.sprite.x += Phaser.Math.Clamp(
          this.player.x - fallingItem.sprite.x,
          -step,
          step,
        );
      }

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

    const vx =
      this.phase === 3
        ? Phaser.Math.Between(-item.phase3DriftSpeed, item.phase3DriftSpeed)
        : 0;

    this.items.push({ sprite, kind, vx });
  }

  private onCatch(kind: ItemKind): void {
    const { scoring, ui } = GAME_CONFIG;

    if (kind === "food") {
      this.combo += 1;
      this.updateComboMultiplier();

      const gained = scoring.foodScore * this.comboMultiplier;
      this.score += gained;
      this.updateHud();
      this.floatMessage(
        `+${gained}`,
        this.player.x,
        this.player.y + ui.floatMessageYOffset,
        ui.catchFoodColor,
      );
      this.bouncePlayer();
      sfx.catch(this.comboMultiplier);
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
      sfx.star();
      return;
    }

    if (kind === "magnet") {
      this.magnetMsLeft = GAME_CONFIG.item.magnetDurationMs;
      this.floatMessage(
        ui.magnetMessage,
        this.player.x,
        this.player.y + ui.floatMessageYOffset,
        ui.catchStarColor,
      );
      sfx.powerUp();
      return;
    }

    if (kind === "shield") {
      this.shieldActive = true;
      this.updateHud();
      this.floatMessage(
        ui.shieldMessage,
        this.player.x,
        this.player.y + ui.floatMessageYOffset,
        ui.catchStarColor,
      );
      sfx.powerUp();
      return;
    }

    // Garbage or bomb.
    const damage = kind === "bomb" ? scoring.bombDamage : scoring.garbageDamage;

    if (this.shieldActive) {
      this.shieldActive = false;
      this.updateHud();
      this.floatMessage(
        ui.shieldBlockMessage,
        this.player.x,
        this.player.y + ui.floatMessageYOffset,
        ui.catchStarColor,
      );
    } else {
      this.breakCombo();
      this.lives -= damage;
      this.updateHud();
      this.flashRed();
      this.floatMessage(
        kind === "bomb" ? ui.bombMessage : ui.garbageMessage,
        this.player.x,
        this.player.y + ui.floatMessageYOffset,
        ui.damageColor,
      );
    }

    sfx.damage();
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
    // Missing food breaks the streak but costs no lives.
    this.breakCombo();
  }

  private updateComboMultiplier(): void {
    const { combo } = GAME_CONFIG;
    this.comboMultiplier = Math.min(
      1 + Math.floor(this.combo / combo.catchesPerStep),
      combo.maxMultiplier,
    );
    this.updateHud();

    this.comboText.setScale(combo.comboPulseScale);
    this.tweens.add({
      targets: this.comboText,
      scale: 1,
      duration: combo.comboPulseMs,
      ease: "Back.out",
    });
  }

  private breakCombo(): void {
    if (this.combo === 0) return;

    this.combo = 0;
    this.comboMultiplier = 1;
    this.updateHud();

    const { ui } = GAME_CONFIG;
    this.floatMessage(
      ui.comboBreakMessage,
      this.player.x,
      this.player.y + ui.floatMessageYOffset,
      ui.damageColor,
    );
    sfx.comboLost();
  }

  private checkDefeat(): void {
    if (this.lives <= 0) {
      this.endGame(GAME_CONFIG.ui.gameOverReason);
    }
  }

  private endGame(reason: string): void {
    this.gameOver = true;
    sfx.gameOver();

    const isRecord = this.score > this.best;
    if (isRecord) {
      this.best = this.score;
      this.saveBest();
    }

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
      .text(
        width / 2,
        height / 2 + ui.gameOverTitleYOffset,
        isRecord ? ui.gameOverRecordTitle : ui.gameOverTitle,
        {
          fontFamily: ui.fontFamily,
          fontSize: ui.gameOverTitleFontSize,
          color: ui.gameOverTitleColor,
        },
      )
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
      .text(
        width / 2,
        height / 2 + ui.gameOverBestYOffset,
        `${ui.bestLabel}${this.best}`,
        {
          fontFamily: ui.fontFamily,
          fontSize: ui.gameOverScoreFontSize,
          color: ui.gameOverBestColor,
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

    const heart =
      this.phase === 1
        ? ui.heartEmoji
        : this.phase === 2
          ? phases.phase2Heart
          : phases.phase3Heart;
    const hearts = heart.repeat(Math.max(0, this.lives)) || ui.deadEmoji;
    this.livesText.setText(
      `${ui.livesLabel}${hearts}${this.shieldActive ? ui.shieldHudBadge : ""}`,
    );

    this.comboText.setText(`🔥 x${this.comboMultiplier}`);
    this.comboText.setVisible(this.comboMultiplier > 1);
  }

  private loadBest(): number {
    try {
      return Number(window.localStorage.getItem(GameScene.BEST_KEY)) || 0;
    } catch {
      return 0; // storage unavailable (e.g. private mode) — play without a record
    }
  }

  private saveBest(): void {
    try {
      window.localStorage.setItem(GameScene.BEST_KEY, String(this.best));
    } catch {
      // storage unavailable — the record just won't persist between sessions
    }
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
