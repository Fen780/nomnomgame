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

type ItemKind = "food" | "garbage";

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

    this.player = this.add
      .text(width / 2, height - 52, "🐱", { fontSize: "52px" })
      .setOrigin(0.5);

    this.scoreText = this.add.text(20, 14, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "22px",
      color: "#ffffff",
    });

    this.livesText = this.add
      .text(width / 2, 14, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#f472b6",
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width / 2, height - 8, "← → / A D — move the cat", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#64748b",
      })
      .setOrigin(0.5, 1);

    this.updateHud();

    if (!this.input.keyboard) {
      throw new Error("Keyboard input is unavailable.");
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<"left" | "right", Phaser.Input.Keyboard.Key>;
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;

    const seconds = delta / 1000;
    this.elapsed += seconds;

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
    const isGarbage = Math.random() < GARBAGE_CHANCE;
    const emoji = isGarbage
      ? GARBAGE_EMOJI
      : FOOD_EMOJIS[Phaser.Math.Between(0, FOOD_EMOJIS.length - 1)];

    const sprite = this.add
      .text(Phaser.Math.Between(40, width - 40), -20, emoji, {
        fontSize: "36px",
      })
      .setOrigin(0.5);

    this.items.push({ sprite, kind: isGarbage ? "garbage" : "food" });
  }

  private onCatch(kind: ItemKind): void {
    if (kind === "food") {
      this.score += 1;
      this.updateHud();
      this.floatMessage("+1", this.player.x, this.player.y - 40, "#4ade80");
      this.player.setScale(1.25);
      this.tweens.add({
        targets: this.player,
        scale: 1,
        duration: 130,
        ease: "Back.out",
      });
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
    this.livesText.setText(
      `Lives: ${"❤️".repeat(Math.max(0, this.lives)) || "💀"}`,
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
