import Phaser from "phaser";

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
const PHASE_1_DURATION_SECONDS = 60; // active play time before phase 2 starts
const PHASE_2_WARNING_SECONDS = 5; // warning shown this many seconds before phase 2
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

/**
 * "Hungry Cat" — a cat catches food falling from the sky.
 *
 * - Catch food: +1 score.
 * - Catch garbage: lose a life.
 * - Let food fall to the ground: lose a life.
 * - 10 lives in total; game over when they run out (10 missed foods = instant loss).
 * - Fall speed and spawn rate grow while you play.
 */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"left" | "right", Phaser.Input.Keyboard.Key>;
  private items: FallingItem[] = [];

  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;

  private score = 0;
  private lives = START_LIVES;
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

    // Reset everything (scene.restart() reuses this instance).
    this.items = [];
    this.score = 0;
    this.lives = START_LIVES;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.gameOver = false;
    this.paused = false;
    this.phase = 1;
    this.phaseWarningShown = false;
    this.phaseWarning = null;
    this.cameras.main.setBackgroundColor(PHASE_1_BACKGROUND);

    this.player = this.add
      .text(width / 2, height - 52, "🐱", { fontSize: "52px" })
      .setOrigin(0.5);

    this.scoreText = this.add.text(20, 14, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "22px",
      color: "#1e293b",
    });

    this.livesText = this.add
      .text(width / 2, 14, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#d6336c",
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width / 2, height - 8, "← → / A D — move the cat · Esc — pause", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#64748b",
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
        PAUSE_OVERLAY_ALPHA,
      )
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    this.pauseTitle = this.add
      .text(width / 2, height / 2 - 40, "PAUSED", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "48px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false);

    this.pauseHint = this.add
      .text(width / 2, height / 2 + 20, "Press Esc to continue", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#94a3b8",
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

    const fallSpeed = Math.min(
      BASE_FALL_SPEED + this.elapsed * SPEED_RAMP_PER_SECOND,
      MAX_FALL_SPEED,
    );
    const spawnInterval = Math.max(
      BASE_SPAWN_INTERVAL_MS - this.elapsed * SPAWN_INTERVAL_RAMP_PER_SECOND,
      MIN_SPAWN_INTERVAL_MS,
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

    if (
      !this.phaseWarningShown &&
      this.elapsed >= PHASE_1_DURATION_SECONDS - PHASE_2_WARNING_SECONDS
    ) {
      this.phaseWarningShown = true;
      this.showPhaseWarning();
    }

    if (this.elapsed >= PHASE_1_DURATION_SECONDS) {
      this.startPhase2();
    }
  }

  private showPhaseWarning(): void {
    const { width, height } = this.scale;
    this.phaseWarning = this.add
      .text(width / 2, height / 2 - 60, "⚠️ PHASE 2 INCOMING ⚠️", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#fde047",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(15);

    this.tweens.add({
      targets: this.phaseWarning,
      alpha: 0.3,
      duration: 450,
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
    this.cameras.main.setBackgroundColor(PHASE_2_BACKGROUND);
    this.player.setText(DEMON_EMOJI);
    this.updateHud();

    const { width, height } = this.scale;
    const banner = this.add
      .text(width / 2, height / 2 - 60, "🔥 PHASE 2 🔥", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "46px",
        color: "#fde047",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(15);

    this.tweens.add({
      targets: banner,
      alpha: 0,
      y: height / 2 - 110,
      duration: 1400,
      ease: "Cubic.easeOut",
      onComplete: () => banner.destroy(),
    });
  }

  private movePlayer(seconds: number): void {
    let dx = 0;
    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;

    this.player.x += dx * PLAYER_SPEED * seconds;
    this.player.x = Phaser.Math.Clamp(
      this.player.x,
      PLAYER_HALF_WIDTH,
      this.scale.width - PLAYER_HALF_WIDTH,
    );
  }

  private moveItems(fallSpeed: number, seconds: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.sprite.y += fallSpeed * seconds;

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        item.sprite.x,
        item.sprite.y,
      );

      if (distance <= PLAYER_HALF_WIDTH + ITEM_RADIUS) {
        this.removeItem(i);
        this.onCatch(item.kind);
        continue;
      }

      if (item.sprite.y > this.scale.height + 24) {
        this.removeItem(i);
        if (item.kind === "food") this.onFoodMissed();
      }
    }
  }

  private removeItem(index: number): void {
    const [item] = this.items.splice(index, 1);
    item.sprite.destroy();
  }

  private spawnItem(): void {
    const { width } = this.scale;
    const { kind, emoji } = this.pickItem();

    const sprite = this.add
      .text(Phaser.Math.Between(40, width - 40), -20, emoji, {
        fontSize: "36px",
      })
      .setOrigin(0.5);

    this.items.push({ sprite, kind });
  }

  private pickItem(): { kind: ItemKind; emoji: string } {
    const roll = Math.random();

    if (this.phase === 2) {
      // Phase 2 mix: 10% bomb, 10% star, 20% garbage, 60% food.
      if (roll < BOMB_CHANCE) return { kind: "bomb", emoji: BOMB_EMOJI };
      if (roll < BOMB_CHANCE + STAR_CHANCE) {
        return { kind: "star", emoji: STAR_EMOJI };
      }
      if (roll < BOMB_CHANCE + STAR_CHANCE + GARBAGE_CHANCE) {
        return { kind: "garbage", emoji: GARBAGE_EMOJI };
      }
      return {
        kind: "food",
        emoji: FOOD_EMOJIS[Phaser.Math.Between(0, FOOD_EMOJIS.length - 1)],
      };
    }

    // Phase 1 mix: 22% garbage, 78% food.
    if (roll < GARBAGE_CHANCE) return { kind: "garbage", emoji: GARBAGE_EMOJI };
    return {
      kind: "food",
      emoji: FOOD_EMOJIS[Phaser.Math.Between(0, FOOD_EMOJIS.length - 1)],
    };
  }

  private onCatch(kind: ItemKind): void {
    if (kind === "food") {
      this.score += 1;
      this.updateHud();
      this.floatMessage("+1", this.player.x, this.player.y - 40, "#4ade80");
      this.bouncePlayer();
      return;
    }

    if (kind === "star") {
      this.score += 3;
      this.updateHud();
      this.floatMessage("+3 ⭐", this.player.x, this.player.y - 40, "#facc15");
      this.bouncePlayer();
      return;
    }

    if (kind === "bomb") {
      this.lives -= 2;
      this.updateHud();
      this.flashRed();
      this.floatMessage(
        "💥 bomb!",
        this.player.x,
        this.player.y - 40,
        "#f87171",
      );
      this.checkDefeat();
      return;
    }

    this.lives -= 1;
    this.updateHud();
    this.flashRed();
    this.floatMessage(
      "💔 garbage!",
      this.player.x,
      this.player.y - 40,
      "#f87171",
    );
    this.checkDefeat();
  }

  private bouncePlayer(): void {
    this.player.setScale(1.25);
    this.tweens.add({
      targets: this.player,
      scale: 1,
      duration: 130,
      ease: "Back.out",
    });
  }

  private onFoodMissed(): void {
    this.lives -= 1;
    this.updateHud();
    this.floatMessage(
      "💔 missed!",
      this.player.x,
      this.player.y - 40,
      "#f87171",
    );
    this.checkDefeat();
  }

  private checkDefeat(): void {
    if (this.lives <= 0) {
      this.endGame("The cat ran out of lives!");
    }
  }

  private endGame(reason: string): void {
    this.gameOver = true;
    const { width, height } = this.scale;

    this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
      .setOrigin(0.5)
      .setDepth(20);

    this.add
      .text(width / 2, height / 2 - 70, "GAME OVER", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "48px",
        color: "#f87171",
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.add
      .text(width / 2, height / 2, reason, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#e2e8f0",
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.add
      .text(width / 2, height / 2 + 56, `Score: ${this.score}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "30px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.add
      .text(width / 2, height / 2 + 120, "Press R or click to restart", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#94a3b8",
      })
      .setOrigin(0.5)
      .setDepth(21);

    if (this.input.keyboard) {
      this.input.keyboard.once("keydown-R", () => this.scene.restart());
    }
    this.input.once("pointerdown", () => this.scene.restart());
  }

  private updateHud(): void {
    this.scoreText.setText(`Score: ${this.score}`);
    const heart = this.phase === 2 ? PHASE_2_HEART : "❤️";
    this.livesText.setText(
      `Lives: ${heart.repeat(Math.max(0, this.lives)) || "💀"}`,
    );
  }

  private flashRed(): void {
    const { width, height } = this.scale;
    const flash = this.add
      .rectangle(0, 0, width, height, 0xff3333, 0.4)
      .setOrigin(0);
    flash.setDepth(10);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 240,
      onComplete: () => flash.destroy(),
    });
  }

  private floatMessage(
    text: string,
    x: number,
    y: number,
    color: string,
  ): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: label,
      y: y - 36,
      alpha: 0,
      duration: 700,
      onComplete: () => label.destroy(),
    });
  }
}
