import Phaser from 'phaser';
import { BOARD, GAME, RULES, levelConfig, randomLevel } from '../config/gameConfig';
import { BallManager } from '../game/BallManager';
import { AimController } from '../game/AimController';
import { MergeManager, type MergeResult } from '../game/MergeManager';
import { OverflowMonitor } from '../game/OverflowMonitor';
import { ScoreManager } from '../game/ScoreManager';
import { saves } from '../services/SaveService';
import { platform } from '../services/PlatformService';
import { audio } from '../services/AudioManager';
import { Effects } from '../ui/Effects';
import { ui } from '../ui/GameUI';
import { memeTexture } from '../ui/TextureFactory';
import { memeShape } from '../game/MemeShape';
import { PhysicsDebug } from '../game/PhysicsDebug';

export class GameScene extends Phaser.Scene {
  balls!: BallManager;
  score!: ScoreManager;
  currentLevel = 1;
  nextLevel = 1;
  gameTime = 0;
  ended = false;
  paused = false;
  private merges!: MergeManager;
  private overflow = new OverflowMonitor();
  private effects!: Effects;
  private preview!: Phaser.GameObjects.Image;
  private guide!: Phaser.GameObjects.Graphics;
  private dangerLine!: Phaser.GameObjects.Graphics;
  private accumulator = 0;
  private dropReadyAt = 0;
  aimController!: AimController;
  physicsDebug!: PhysicsDebug;
  private aimX = GAME.width / 2;
  private targetAimX = GAME.width / 2;
  private lastComboAt = -Infinity;
  private initialBest = 0;
  private bombArmed = false;
  private secondChanceUsed = false;
  private secondChancePending = false;
  private session = 0;
  private unsubscribePlatform?: () => void;
  private world!: Phaser.Physics.Matter.World;

  constructor() { super('Game'); }

  create(): void {
    this.session++;
    this.secondChancePending = false;
    this.gameTime = this.accumulator = this.dropReadyAt = 0;
    this.ended = this.paused = this.bombArmed = this.secondChanceUsed = false;
    this.lastComboAt = -Infinity;
    this.aimX = this.targetAimX = GAME.width / 2;
    this.initialBest = saves.snapshot.bestScore;
    this.currentLevel = randomLevel();
    this.nextLevel = randomLevel();
    this.score = new ScoreManager();
    this.balls = new BallManager(this);
    this.effects = new Effects(this);
    this.merges = new MergeManager(this, this.balls, (result) => this.onMerge(result));
    this.matter.world.autoUpdate = false;
    this.world = this.matter.world;
    this.drawBoard();
    this.createWalls();
    this.physicsDebug = new PhysicsDebug(this);
    this.guide = this.add.graphics().setDepth(2);
    this.dangerLine = this.add.graphics().setDepth(6);
    this.drawDanger(false);
    this.preview = this.add.image(this.aimX, BOARD.spawnY, memeTexture(this.currentLevel)).setDepth(7);
    this.updatePreview();
    this.matter.world.on('collisionstart', this.onCollision, this);
    this.matter.world.on('collisionactive', this.onCollision, this);
    this.aimController = new AimController(this.game.canvas, {
      canDrop: () => this.canDrop(),
      contains: (point) => this.insideField(point),
      aim: (x, snap) => this.aim(x, snap),
      drop: ({ x, y }) => this.dropOrBomb(x, y),
    });
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('keydown', this.onKeyDown);
    this.unsubscribePlatform = platform.onPause(() => this.onBlur());
    saves.beginGame();
    ui.game({ pause: () => this.pauseGame(), resume: () => this.resumeGame(), restart: () => this.scene.restart(), menu: () => this.scene.start('Menu') });
    ui.updateNext(this.nextLevel);
    platform.gameplayStart();
    audio.setSuspended('game', false);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    if (document.hidden || platform.pausedByPlatform) this.onBlur();
  }

  update(_time: number, delta: number): void {
    if (this.paused || this.ended) return;
    const aimBlend = 1 - Math.exp(-Math.min(delta, RULES.maxFrameDeltaMs) / RULES.aimResponseMs);
    this.aimX = Phaser.Math.Linear(this.aimX, this.targetAimX, aimBlend);
    this.preview.x = this.aimX;
    this.drawGuide();
    this.accumulator += Math.min(delta, RULES.maxFrameDeltaMs);
    let steps = 0;
    while (this.accumulator >= RULES.fixedStepMs && steps < RULES.maxStepsPerFrame && !this.ended) {
      this.balls.limitVelocity();
      this.balls.capturePrevious();
      // Thin contour features need a smaller travel distance during fast falls/rotation.
      const substeps = this.balls.needsSubstep() ? 2 : 1;
      const step = RULES.fixedStepMs / substeps;
      for (let substep = 0; substep < substeps && !this.ended; substep++) {
        this.matter.world.step(step);
        this.gameTime += step;
        this.merges.flush(this.gameTime);
        this.balls.limitVelocity();
        const progress = this.overflow.update(this.balls.balls.values(), this.gameTime, step);
        ui.warning(progress);
        this.drawDanger(progress > 0);
        if (progress >= 1) this.gameOver();
      }
      this.accumulator -= RULES.fixedStepMs;
      steps++;
    }
    // Drop excess time instead of a runaway catch-up loop after long frames.
    if (steps === RULES.maxStepsPerFrame) this.accumulator = Math.min(this.accumulator, RULES.fixedStepMs);
    this.balls.sync(this.ended ? 1 : Math.min(1, this.accumulator / RULES.fixedStepMs));
    if (this.physicsDebug.enabled) this.physicsDebug.draw(this.matter.world.getAllBodies());
    if (!this.ended) {
      const ready = this.gameTime >= this.dropReadyAt;
      this.preview.setVisible(ready && !this.bombArmed);
      this.guide.setVisible(ready && !this.bombArmed);
      if (this.gameTime - this.lastComboAt > RULES.comboWindowMs) ui.updateCombo(0);
    }
  }

  pauseGame(): void {
    if (this.ended) return;
    this.paused = true;
    this.accumulator = 0;
    this.cancelDrag();
    this.tweens.pauseAll();
    audio.setSuspended('game', true);
    platform.gameplayStop();
  }

  resumeGame(): void {
    if (this.ended || document.hidden || platform.pausedByPlatform) {
      if (!this.ended) { this.paused = true; ui.pause(); }
      return;
    }
    this.paused = false;
    this.accumulator = 0;
    this.tweens.resumeAll();
    audio.setSuspended('game', false);
    platform.gameplayStart();
  }

  /** Integration entry point, deliberately absent from first-version UI. */
  async requestBomb(): Promise<boolean> {
    if (this.ended || this.paused || this.bombArmed) return false;
    this.pauseGame();
    try {
      const rewarded = await platform.rewarded('bomb');
      if (!this.sys.isActive() || this.ended) return false;
      this.bombArmed = rewarded;
      return rewarded;
    } finally { if (this.sys.isActive() && !ui.hasModal) this.resumeGame(); }
  }

  /** Removes upper bodies only after a genuine SDK reward callback. */
  async requestSecondChance(): Promise<boolean> {
    if (!this.ended || this.secondChanceUsed || this.secondChancePending) return false;
    const session = this.session;
    this.secondChancePending = true;
    try {
      const rewarded = await platform.rewarded('second-chance');
      if (!rewarded || session !== this.session || !this.sys.isActive() || !this.ended) return false;
      this.secondChanceUsed = true;
      for (const ball of [...this.balls.balls.values()]) {
        if (ball.body.bounds.min.y < BOARD.dangerY + 100) this.balls.remove(ball);
        else ball.overflowMs = 0;
      }
      this.ended = false;
      this.accumulator = 0;
      ui.warning(0);
      this.drawDanger(false);
      ui.closeModal();
      this.updatePreview();
      // Returning from an ad in a hidden/unfocused tab must keep the game paused.
      if (document.hidden || !document.hasFocus()) { this.paused = true; ui.pause(); }
      else this.resumeGame();
      return true;
    } finally { if (session === this.session) this.secondChancePending = false; }
  }

  private onCollision(event: MatterJS.IEventCollision<MatterJS.Engine>): void {
    if (!this.paused && !this.ended) this.merges.queue(event.pairs);
  }

  private onMerge(result: MergeResult): void {
    const combo = this.score.add(result.points, result.level, this.gameTime);
    this.lastComboAt = this.gameTime;
    ui.updateScore(this.score.score, saves.snapshot.bestScore);
    ui.updateCombo(combo);
    this.effects.merge(result, combo);
  }

  private insideField(pointer: { x: number; y: number }): boolean {
    return pointer.x >= BOARD.left && pointer.x <= BOARD.right && pointer.y >= 216 && pointer.y <= BOARD.bottom;
  }

  private canDrop(): boolean {
    return !this.paused && !this.ended && !ui.hasModal && this.gameTime >= this.dropReadyAt;
  }

  private cancelDrag(): void { this.aimController?.cancel(); }

  private dropOrBomb(x: number, y: number): void {
    if (!this.canDrop()) return;
    if (this.bombArmed) {
      const ball = this.balls.at(x, y);
      if (ball) { this.balls.remove(ball); this.bombArmed = false; }
      return;
    }
    this.balls.create(this.currentLevel, this.aimX, BOARD.spawnY, this.gameTime);
    this.score.observeLevel(this.currentLevel);
    this.dropReadyAt = this.gameTime + RULES.dropCooldownMs;
    this.currentLevel = this.nextLevel;
    this.nextLevel = randomLevel();
    this.updatePreview();
    ui.updateNext(this.nextLevel);
    this.preview.setVisible(false);
    this.guide.setVisible(false);
  }

  private aim(x: number, snap = false): void {
    const shape = memeShape(this.currentLevel);
    this.targetAimX = Phaser.Math.Clamp(x, BOARD.left - shape.bounds.minX + 1, BOARD.right - shape.bounds.maxX - 1);
    if (snap) this.aimX = this.targetAimX;
    this.preview.x = this.aimX;
    this.drawGuide();
  }

  private updatePreview(): void {
    const config = levelConfig(this.currentLevel);
    const shape = memeShape(this.currentLevel);
    this.preview.setTexture(memeTexture(this.currentLevel)).setOrigin(shape.originX, shape.originY).setDisplaySize(config.diameter, config.diameter);
    this.aim(this.aimX, true);
  }

  private drawGuide(): void {
    this.guide.clear().lineStyle(1, 0xbbb4cc, 0.24);
    for (let y = BOARD.spawnY + memeShape(this.currentLevel).bounds.maxY + 8; y < BOARD.bottom - 6; y += 12) {
      this.guide.lineBetween(this.aimX, y, this.aimX, y + 5);
    }
    this.guide.fillStyle(0xbbb4cc, 0.55).fillCircle(this.aimX, BOARD.bottom - 5, 3);
  }

  private drawDanger(warning: boolean): void {
    this.dangerLine.clear().lineStyle(1.5, warning ? 0xd6a4ac : 0x76728f, warning ? 0.9 : 0.5);
    for (let x = BOARD.left + 5; x < BOARD.right - 5; x += 12) this.dangerLine.lineBetween(x, BOARD.dangerY, Math.min(x + 5, BOARD.right - 5), BOARD.dangerY);
  }

  private createWalls(): void {
    const width = BOARD.right - BOARD.left;
    const wall = BOARD.wallThickness;
    const top = 145;
    const height = BOARD.bottom - top;
    const options = { isStatic: true, friction: 0.35, restitution: 0.08, label: 'wall' };
    this.matter.add.rectangle(BOARD.left - wall / 2, top + height / 2, wall, height + wall * 2, options);
    this.matter.add.rectangle(BOARD.right + wall / 2, top + height / 2, wall, height + wall * 2, options);
    this.matter.add.rectangle((BOARD.left + BOARD.right) / 2, BOARD.bottom + wall / 2, width + wall * 2, wall, options);
  }

  private drawBoard(): void {
    const graphic = this.add.graphics().setDepth(0);
    const width = BOARD.right - BOARD.left;
    graphic.fillStyle(0x20262f, 0.4).fillRoundedRect(22, BOARD.top + 12, width + 12, BOARD.bottom - BOARD.top + 4, 20);
    graphic.fillStyle(0x303942).fillRoundedRect(BOARD.left, BOARD.top, width, BOARD.bottom - BOARD.top, { tl: 12, tr: 12, bl: 2, br: 2 });
    graphic.fillStyle(0x3d4750, 0.65).fillRect(BOARD.left, BOARD.top, width, 38);
    graphic.lineStyle(1, 0x65707c, 0.8).strokeRoundedRect(BOARD.left - 0.5, BOARD.top, width + 1, BOARD.bottom - BOARD.top + 1, 12);
    // Visible inner wall faces and floor align precisely with collision boundaries.
    graphic.fillStyle(0x969caa, 0.55).fillRect(BOARD.left - 3, BOARD.top + 10, 3, BOARD.bottom - BOARD.top - 10);
    graphic.fillRect(BOARD.right, BOARD.top + 10, 3, BOARD.bottom - BOARD.top - 10);
    graphic.fillStyle(0xa5a0ae, 0.65).fillRoundedRect(BOARD.left - 3, BOARD.bottom, width + 6, 5, 2);
    graphic.fillStyle(0x88919b, 0.3);
    for (let y = BOARD.top + 61; y < BOARD.bottom - 10; y += 24) {
      for (let x = BOARD.left + 13; x < BOARD.right - 8; x += 24) graphic.fillCircle(x, y, 0.8);
    }
    graphic.lineStyle(2, 0xbbb4cc, 0.4).lineBetween(BOARD.left - 2, BOARD.top + 6, BOARD.left - 2, BOARD.top + 36);
    graphic.lineBetween(BOARD.right + 2, BOARD.top + 6, BOARD.right + 2, BOARD.top + 36);
  }

  private gameOver(): void {
    if (this.ended) return;
    this.ended = true;
    audio.setSuspended('game', true);
    this.cancelDrag();
    this.preview.setVisible(false);
    this.guide.setVisible(false);
    this.tweens.pauseAll();
    saves.record(this.score.score, this.score.maxLevel);
    platform.gameplayStop();
    ui.gameOver(this.score.score, this.score.maxLevel, this.score.score > this.initialBest,
      platform.supportsRewards && !this.secondChanceUsed ? () => this.requestSecondChance() : undefined);
  }

  private onBlur(): void {
    if (!this.paused && !this.ended && !ui.hasModal) {
      this.pauseGame();
      ui.pause();
    }
  }
  private onVisibility = (): void => { if (document.hidden) this.onBlur(); };
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (!this.paused && !this.ended) { this.pauseGame(); ui.pause(); }
    }
  };

  private cleanup(): void {
    this.session++;
    this.unsubscribePlatform?.();
    this.world.off('collisionstart', this.onCollision, this);
    this.world.off('collisionactive', this.onCollision, this);
    this.aimController.destroy();
    this.physicsDebug.destroy();
    this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('keydown', this.onKeyDown);
    this.merges.clear();
    this.balls.clear();
    this.effects.clear();
    this.tweens.killAll();
    this.tweens.resumeAll();
    platform.gameplayStop();
  }
}
