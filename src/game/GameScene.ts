import Phaser from "phaser";
import { GAME_CONFIG } from "./gameConfig";
import { pickItem, pickReachableSpawnX } from "./items";
import { sfx } from "./sounds";
import type { FallingItem, ItemKind } from "./types";
import appleUrl from "../../assets/apple.svg?url&no-inline";
import backgroundCosmosUrl from "../../assets/background-cosmos.svg?url&no-inline";
import backgroundGardenUrl from "../../assets/background-garden.svg?url&no-inline";
import backgroundVolcanoUrl from "../../assets/background-volcano.svg?url&no-inline";
import bombUrl from "../../assets/bomb.svg?url&no-inline";
import catUrl from "../../assets/cat.svg?url&no-inline";
import demonCatUrl from "../../assets/demon-cat.svg?url&no-inline";
import donutUrl from "../../assets/donut.svg?url&no-inline";
import garbageUrl from "../../assets/garbage.svg?url&no-inline";
import grapesUrl from "../../assets/grapes.svg?url&no-inline";
import magnetUrl from "../../assets/magnet.svg?url&no-inline";
import pizzaUrl from "../../assets/pizza.svg?url&no-inline";
import shieldUrl from "../../assets/shield.svg?url&no-inline";
import slowdownUrl from "../../assets/slowdown.svg?url&no-inline";
import spiritCatUrl from "../../assets/spirit-cat.svg?url&no-inline";
import starUrl from "../../assets/star.svg?url&no-inline";

/**
 * "Hungry Cat" — a cat catches food falling from the sky.
 *
 * - Catch food: +1 × combo multiplier (the streak grows every few catches).
 * - Catch stars: +3. Catch magnets/shields: power-ups.
 * - Catch garbage or bombs: lose lives (a shield absorbs one hit).
 * - Let food fall to the ground: the combo breaks (no lives lost).
 * - Catchable drops spawn within the cat's reach; hazards stay random.
 * - Phase 2 (score 20): hell mode. Phase 3 (score 60): the void — diagonal drops.
 * - The best score is saved to localStorage.
 *
 * All tunable values live in `gameConfig.ts` — a game designer can change
 * numbers, emojis, colors and texts there without touching this file.
 */
export class GameScene extends Phaser.Scene {
  private static readonly BEST_KEY = "hungry-cat-best";

  private player!: Phaser.GameObjects.Image;
  private background!: Phaser.GameObjects.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"left" | "right", Phaser.Input.Keyboard.Key>;
  private items: FallingItem[] = [];

  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private livesPlate!: Phaser.GameObjects.Rectangle;
  private hudPlate!: Phaser.GameObjects.Rectangle;
  private powerUpPlate!: Phaser.GameObjects.Rectangle;
  private powerUpText!: Phaser.GameObjects.Text;
  private magnetAura!: Phaser.GameObjects.Ellipse;
  private shieldAura!: Phaser.GameObjects.Ellipse;
  private hudComboSlotWidth = 0;
  private lastPowerUpText = "";

  private score = 0;
  private best = 0;
  private lives = GAME_CONFIG.scoring.startLives;
  private combo = 0;
  private comboMultiplier = 1;
  private shieldActive = false;
  private magnetMsLeft = 0;
  private slowdownMsLeft = 0;
  private comboLessonShown = false;
  private lowLivesTween: Phaser.Tweens.Tween | null = null;

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

  preload(): void {
    const textures: Record<string, string> = {
      cat: catUrl,
      "demon-cat": demonCatUrl,
      "spirit-cat": spiritCatUrl,
      apple: appleUrl,
      pizza: pizzaUrl,
      donut: donutUrl,
      grapes: grapesUrl,
      garbage: garbageUrl,
      bomb: bombUrl,
      star: starUrl,
      magnet: magnetUrl,
      shield: shieldUrl,
      slowdown: slowdownUrl,
      "background-garden": backgroundGardenUrl,
      "background-volcano": backgroundVolcanoUrl,
      "background-cosmos": backgroundCosmosUrl,
    };

    for (const [key, url] of Object.entries(textures)) {
      const background = key.startsWith("background-");
      this.load.svg(
        key,
        url,
        background ? { width: 600, height: 500 } : { width: 128, height: 128 },
      );
    }
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
    this.slowdownMsLeft = 0;
    this.comboLessonShown = false;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.gameOver = false;
    this.paused = false;
    this.phase = 1;
    this.phaseWarningShown = false;
    this.phaseWarning = null;
    this.pointerTargetX = null;
    this.lowLivesTween = null;
    this.hudComboSlotWidth = 0;
    this.lastPowerUpText = "";
    this.background = this.add
      .image(width / 2, height / 2, phases.phase1BackgroundTexture)
      .setDisplaySize(width, height)
      .setDepth(-10);

    this.player = this.add
      .image(width / 2, height - player.yFromBottom, player.phase1Texture)
      .setDisplaySize(player.displaySize, player.displaySize)
      .setDepth(1);

    // Power-up auras sit behind the cat (depth -1) and follow it every frame.
    const powerUps = ui.powerUps;
    this.magnetAura = this.add
      .ellipse(
        0,
        0,
        powerUps.magnetAura.radius * 2,
        powerUps.magnetAura.radius * 2,
        powerUps.magnetAura.color,
        powerUps.magnetAura.alpha,
      )
      .setDepth(-1)
      .setVisible(false);

    this.shieldAura = this.add
      .ellipse(
        0,
        0,
        powerUps.shieldAura.radius * 2,
        powerUps.shieldAura.radius * 2,
      )
      .setStrokeStyle(
        powerUps.shieldAura.strokeWidth,
        powerUps.shieldAura.color,
        powerUps.shieldAura.alpha,
      )
      .setDepth(-1)
      .setVisible(false);

    // Score / best / combo share one dark plate so they read on every phase.
    this.hudPlate = this.add
      .rectangle(0, 0, 1, 1, ui.hudPlate.fillColor, ui.hudPlate.fillAlpha)
      .setOrigin(0, 0)
      .setDepth(ui.hudDepth)
      .setStrokeStyle(
        ui.hudPlate.strokeWidth,
        ui.hudPlate.strokeColor,
        ui.hudPlate.strokeAlpha,
      );

    this.scoreText = this.add
      .text(ui.scoreX, ui.hudY, "", {
        fontFamily: ui.fontFamily,
        fontSize: ui.hudFontSize,
        color: ui.scoreColor,
      })
      .setDepth(ui.hudDepth + 1);

    this.bestText = this.add
      .text(ui.scoreX, ui.hudY + ui.bestYOffset, "", {
        fontFamily: ui.fontFamily,
        fontSize: ui.bestFontSize,
        color: ui.bestColor,
      })
      .setDepth(ui.hudDepth + 1);

    this.comboText = this.add
      .text(ui.scoreX + GAME_CONFIG.combo.comboTextOffsetX, ui.hudY, "", {
        fontFamily: ui.fontFamily,
        fontSize: GAME_CONFIG.combo.comboFontSize,
        color: GAME_CONFIG.combo.comboColor,
      })
      .setDepth(ui.hudDepth + 1)
      .setVisible(false);

    // Reserve the widest combo label once, so the HUD plate does not resize
    // when the multiplier appears or grows.
    this.comboText.setText(`🔥 x${GAME_CONFIG.combo.maxMultiplier}`);
    this.hudComboSlotWidth = this.comboText.width;
    this.comboText.setText("");

    // Lives plate first, the hearts sit on top of it (see layoutLivesPlate()).
    this.livesPlate = this.add
      .rectangle(0, 0, 1, 1, ui.livesPlate.fillColor, ui.livesPlate.fillAlpha)
      .setOrigin(0, 0)
      .setDepth(ui.hudDepth)
      .setStrokeStyle(
        ui.livesPlate.strokeWidth,
        ui.livesPlate.strokeColor,
        ui.livesPlate.strokeAlpha,
      );

    this.livesText = this.add
      .text(0, 0, "", {
        fontFamily: ui.fontFamily,
        fontSize: ui.livesFontSize,
        color: ui.livesColor,
      })
      .setOrigin(1, 0.5)
      .setDepth(ui.hudDepth + 1);

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

    // Persistent power-up badge under the lives plate (magnet timer + shield).
    this.powerUpPlate = this.add
      .rectangle(0, 0, 1, 1, powerUps.plate.fillColor, powerUps.plate.fillAlpha)
      .setOrigin(0, 0)
      .setDepth(ui.hudDepth)
      .setStrokeStyle(
        powerUps.plate.strokeWidth,
        powerUps.plate.strokeColor,
        powerUps.plate.strokeAlpha,
      )
      .setVisible(false);

    this.powerUpText = this.add
      .text(0, 0, "", {
        fontFamily: ui.fontFamily,
        fontSize: powerUps.fontSize,
        color: powerUps.color,
      })
      .setOrigin(1, 0.5)
      .setDepth(ui.hudDepth + 1)
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

  update(time: number, delta: number): void {
    if (this.gameOver || this.paused) return;

    const seconds = delta / 1000;
    this.elapsed += seconds;
    if (this.magnetMsLeft > 0) {
      this.magnetMsLeft = Math.max(0, this.magnetMsLeft - delta);
      this.updatePowerUpHud();
    }
    if (this.slowdownMsLeft > 0) {
      this.slowdownMsLeft = Math.max(0, this.slowdownMsLeft - delta);
      this.updatePowerUpHud();
    }
    this.updatePowerUpAuras(time);

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
    this.moveItems(
      fallSpeed * (this.slowdownMsLeft > 0 ? GAME_CONFIG.item.slowdownSpeedFactor : 1),
      seconds,
    );

    this.spawnTimer += delta;
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer -= spawnInterval;
      this.spawnItem(fallSpeed);
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
    this.background.setTexture(
      next === 2 ? phases.phase2BackgroundTexture : phases.phase3BackgroundTexture,
    );
    this.player.setTexture(
      next === 2
        ? GAME_CONFIG.player.phase2Texture
        : GAME_CONFIG.player.phase3Texture,
    );
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
        this.onCatch(fallingItem.kind, fallingItem.sprite.x, fallingItem.sprite.y);
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

  private spawnItem(fallSpeed: number): void {
    const { width } = this.scale;
    const { item, player } = GAME_CONFIG;
    const { kind, texture } = pickItem(this.phase, Math.random());

    // Food, stars and power-ups must be catchable, so they spawn inside the
    // distance the cat can cover while the item falls. Garbage and bombs keep
    // a uniform spawn and never target the cat.
    const catchable = kind !== "garbage" && kind !== "bomb";
    const spawnX = catchable
      ? pickReachableSpawnX({
          playerX: this.player.x,
          playerY: this.player.y,
          playerSpeed: player.speed,
          fallSpeed,
          width,
          margin: item.spawnXMargin,
          spawnY: item.spawnY,
          fairness: item.spawnFairness,
          rng: Math.random(),
        })
      : Phaser.Math.Between(item.spawnXMargin, width - item.spawnXMargin);

    const sprite = this.add
      .image(spawnX, item.spawnY, texture)
      .setDisplaySize(item.displaySize, item.displaySize);

    const vx =
      this.phase === 3
        ? Phaser.Math.Between(-item.phase3DriftSpeed, item.phase3DriftSpeed)
        : 0;

    this.items.push({ sprite, kind, vx });
  }

  private onCatch(kind: ItemKind, catchX: number, catchY: number): void {
    const { scoring, ui } = GAME_CONFIG;

    if (kind === "food") {
      const previousMultiplier = this.comboMultiplier;
      this.combo += 1;
      this.updateComboMultiplier();
      if (this.comboMultiplier > previousMultiplier) {
        if (!this.comboLessonShown) {
          this.comboLessonShown = true;
          this.floatMessage(
            GAME_CONFIG.combo.lessonText,
            this.scale.width / 2,
            this.scale.height * GAME_CONFIG.combo.lessonYRatio,
            GAME_CONFIG.ui.comboLessonColor,
            GAME_CONFIG.ui.comboLessonDurationMs,
          );
        }
        this.showComboUpgrade();
      }
      this.showCatchTrail(catchX, catchY);

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
      this.updatePowerUpHud();
      this.floatMessage(
        ui.magnetMessage,
        this.player.x,
        this.player.y + ui.floatMessageYOffset,
        ui.catchStarColor,
        ui.floatPowerUpDurationMs,
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
        ui.floatPowerUpDurationMs,
      );
      sfx.powerUp();
      return;
    }

    if (kind === "slowdown") {
      this.slowdownMsLeft = GAME_CONFIG.item.slowdownDurationMs;
      this.updatePowerUpHud();
      this.floatMessage(
        ui.powerUps.slowdownMessage,
        this.player.x,
        this.player.y + ui.floatMessageYOffset,
        ui.catchStarColor,
        ui.floatPowerUpDurationMs,
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
        ui.floatPowerUpDurationMs,
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
    const baseScaleX = this.player.scaleX;
    const baseScaleY = this.player.scaleY;
    this.player.setScale(
      baseScaleX * ui.bounceScale,
      baseScaleY * ui.bounceScale,
    );
    this.tweens.add({
      targets: this.player,
      scaleX: baseScaleX,
      scaleY: baseScaleY,
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

  private showComboUpgrade(): void {
    const { combo, ui } = GAME_CONFIG;
    const { width, height } = this.scale;
    const centerY = height * combo.upgradeYRatio;
    const label = this.add
      .text(
        width / 2,
        centerY,
        `${combo.levelUpText} x${this.comboMultiplier}`,
        {
          fontFamily: ui.fontFamily,
          fontSize: ui.comboLevelFontSize,
          color: ui.comboLessonColor,
          fontStyle: "bold",
          stroke: "#493b4a",
          strokeThickness: 6,
        },
      )
      .setOrigin(0.5)
      .setDepth(12);
    const flashColor = Phaser.Display.Color.IntegerToRGB(combo.effectColor);
    this.cameras.main.flash(
      combo.effectDurationMs,
      flashColor.r,
      flashColor.g,
      flashColor.b,
    );
    this.tweens.add({
      targets: label,
      scale: combo.popScale,
      alpha: 0,
      y: label.y - combo.popLiftPx,
      duration: combo.effectDurationMs,
      ease: "Cubic.easeOut",
      onComplete: () => label.destroy(),
    });

    for (let i = 0; i < combo.particleCount; i++) {
      const angle = (Math.PI * 2 * i) / combo.particleCount;
      const particle = this.add
        .circle(width / 2, centerY, combo.particleRadius, combo.effectColor)
        .setDepth(11);
      this.tweens.add({
        targets: particle,
        x: particle.x + Math.cos(angle) * combo.particleSpeed,
        y: particle.y + Math.sin(angle) * combo.particleSpeed,
        alpha: 0,
        scale: 0.2,
        duration: combo.effectDurationMs,
        onComplete: () => particle.destroy(),
      });
    }
  }

  private showCatchTrail(x: number, y: number): void {
    const { combo } = GAME_CONFIG;
    const trail = this.add
      .line(0, 0, x, y, this.player.x, this.player.y, combo.trailColor)
      .setLineWidth(combo.trailWidth)
      .setDepth(2);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      duration: combo.trailDurationMs,
      onComplete: () => trail.destroy(),
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
          color: isRecord ? ui.gameOverRecordTitleColor : ui.gameOverTitleColor,
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

    const bestText = this.add
      .text(
        width / 2,
        height / 2 + ui.gameOverBestYOffset,
        `${ui.bestLabel}${this.best}`,
        {
          fontFamily: ui.fontFamily,
          fontSize: ui.gameOverBestFontSize,
          color: ui.gameOverBestColor,
          fontStyle: ui.gameOverBestFontStyle,
        },
      )
      .setOrigin(0.5)
      .setDepth(21);

    if (isRecord) {
      this.tweens.add({
        targets: bestText,
        scale: ui.gameOverRecordPulseScale,
        duration: ui.gameOverRecordPulseMs,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

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
    const { ui } = GAME_CONFIG;
    this.scoreText.setText(`${ui.scoreLabel}${this.score}`);
    this.bestText.setText(`${ui.bestLabel}${this.best}`);

    const heart = this.currentHeart();
    // Measure the plate with a full row of hearts before writing the real
    // text, so the plate keeps a stable size while hearts are being lost.
    this.layoutLivesPlate(heart);

    const hearts = heart.repeat(Math.max(0, this.lives)) || ui.deadEmoji;
    this.livesText.setText(`${ui.livesLabel}${hearts}`);
    this.updateLowLivesPulse();

    this.comboText.setText(`🔥 x${this.comboMultiplier}`);
    this.comboText.setVisible(this.comboMultiplier > 1);

    this.layoutHudPlate();
    this.updatePowerUpHud();
  }

  /** Heart emoji for the current phase (bright ones stay visible on dark backgrounds). */
  private currentHeart(): string {
    const { ui, phases } = GAME_CONFIG;
    if (this.phase === 1) return ui.heartEmoji;
    return this.phase === 2 ? phases.phase2Heart : phases.phase3Heart;
  }

  /** Sizes and right-aligns the lives plate and puts the hearts inside it. */
  private layoutLivesPlate(heart: string): void {
    const { ui, scoring } = GAME_CONFIG;
    const plate = ui.livesPlate;

    // Measure with a full row of hearts so the plate does not resize.
    this.livesText.setText(
      `${ui.livesLabel}${heart.repeat(scoring.startLives)}`,
    );
    const plateWidth = this.livesText.width + plate.paddingX * 2;
    const plateHeight = this.livesText.height + plate.paddingY * 2;
    const plateX = this.scale.width - plate.marginRight - plateWidth;
    const plateY = ui.hudY - plate.paddingY;

    this.livesPlate
      .setSize(plateWidth, plateHeight)
      .setPosition(plateX, plateY);
    this.livesText.setPosition(
      plateX + plateWidth - plate.paddingX,
      plateY + plateHeight / 2,
    );
  }

  /** Pulses the lives plate when the cat is nearly out of lives. */
  private updateLowLivesPulse(): void {
    const { livesPlate } = GAME_CONFIG.ui;
    const low = this.lives > 0 && this.lives <= livesPlate.lowLivesThreshold;

    if (low && !this.lowLivesTween) {
      this.lowLivesTween = this.tweens.add({
        targets: [this.livesPlate, this.livesText],
        alpha: livesPlate.lowLivesMinAlpha,
        duration: livesPlate.lowLivesPulseMs,
        yoyo: true,
        repeat: -1,
      });
    } else if (!low && this.lowLivesTween) {
      this.lowLivesTween.stop();
      this.lowLivesTween = null;
      this.livesPlate.setAlpha(1);
      this.livesText.setAlpha(1);
    }
  }

  /** Sizes and positions the dark plate behind score, best and combo. */
  private layoutHudPlate(): void {
    const { ui, combo } = GAME_CONFIG;
    const plate = ui.hudPlate;

    const comboRight = combo.comboTextOffsetX + this.hudComboSlotWidth;
    const contentWidth = Math.max(
      this.scoreText.width,
      this.bestText.width,
      comboRight,
    );
    const contentHeight = ui.bestYOffset + this.bestText.height;
    const plateWidth = Math.max(
      plate.minWidth,
      contentWidth + plate.paddingX * 2,
    );
    const plateHeight = contentHeight + plate.paddingY * 2;
    const plateX = ui.scoreX - plate.paddingX;
    const plateY = ui.hudY - plate.paddingY;

    this.hudPlate.setSize(plateWidth, plateHeight).setPosition(plateX, plateY);

    this.scoreText.setPosition(ui.scoreX, ui.hudY);
    this.bestText.setPosition(ui.scoreX, ui.hudY + ui.bestYOffset);
    this.comboText.setPosition(
      ui.scoreX + combo.comboTextOffsetX,
      ui.hudY + (this.scoreText.height - this.comboText.height) / 2,
    );
  }

  /**
   * Shows active power-ups under the lives plate: the magnet with its remaining
   * time and the shield while it is still intact. Hidden when nothing is active.
   */
  private updatePowerUpHud(): void {
    const { powerUps } = GAME_CONFIG.ui;

    const parts: string[] = [];
    if (this.magnetMsLeft > 0) {
      parts.push(
        `${powerUps.magnetBadge} ${(this.magnetMsLeft / 1000).toFixed(1)}s`,
      );
    }
    if (this.slowdownMsLeft > 0) {
      parts.push(
        `${powerUps.slowdownBadge} ${(this.slowdownMsLeft / 1000).toFixed(1)}s`,
      );
    }
    if (this.shieldActive) parts.push(powerUps.shieldBadge);

    const text = parts.join(powerUps.separator);
    if (text === this.lastPowerUpText) return;
    this.lastPowerUpText = text;

    const visible = text.length > 0;
    this.powerUpText.setText(text).setVisible(visible);
    this.powerUpPlate.setVisible(visible);
    if (visible) this.layoutPowerUpBadge();
  }

  /** Right-aligns the power-up badge under the lives plate. */
  private layoutPowerUpBadge(): void {
    const { ui } = GAME_CONFIG;
    const plate = ui.powerUps.plate;

    const width = this.powerUpText.width + plate.paddingX * 2;
    const height = this.powerUpText.height + plate.paddingY * 2;
    const x = this.scale.width - ui.livesPlate.marginRight - width;
    const y = this.livesPlate.y + this.livesPlate.height + ui.powerUps.gapY;

    this.powerUpPlate.setSize(width, height).setPosition(x, y);
    this.powerUpText.setPosition(x + width - plate.paddingX, y + height / 2);
  }

  /** Draws the magnet and shield auras around the cat while they are active. */
  private updatePowerUpAuras(time: number): void {
    const { magnetAura, shieldAura } = GAME_CONFIG.ui.powerUps;

    const magnetOn = this.magnetMsLeft > 0;
    this.magnetAura.setVisible(magnetOn);
    if (magnetOn) {
      const pulse = (Math.sin(time / magnetAura.pulseMs) + 1) / 2;
      this.magnetAura
        .setPosition(this.player.x, this.player.y)
        .setScale(1 + pulse * magnetAura.pulseScale)
        .setAlpha(magnetAura.alpha + pulse * magnetAura.pulseAlpha);
    }

    this.shieldAura.setVisible(this.shieldActive);
    if (this.shieldActive) {
      const pulse = (Math.sin(time / shieldAura.pulseMs) + 1) / 2;
      this.shieldAura
        .setPosition(this.player.x, this.player.y)
        .setScale(1 + pulse * shieldAura.pulseScale)
        .setAlpha(shieldAura.minAlpha + pulse * shieldAura.pulseAlpha);
    }
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
    durationMs: number = GAME_CONFIG.ui.floatMessageDurationMs,
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
      duration: durationMs,
      onComplete: () => label.destroy(),
    });
  }
}
