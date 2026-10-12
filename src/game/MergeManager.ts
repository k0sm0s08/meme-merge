import Phaser from 'phaser';
import { levelConfig, nextLevel } from '../config/gameConfig';
import { BallManager } from './BallManager';

export interface MergeResult {
  x: number;
  y: number;
  level: number;
  points: number;
  maximum: boolean;
}

export class MergeManager {
  private pending: [number, number][] = [];

  constructor(private scene: Phaser.Scene, private balls: BallManager, private onMerge: (result: MergeResult) => void) {}

  queue(pairs: readonly MatterJS.IPair[]): void {
    for (const pair of pairs) {
      // Phaser's event declarations use the static Body class for runtime BodyType objects.
      const bodyA = pair.bodyA as unknown as MatterJS.BodyType;
      const bodyB = pair.bodyB as unknown as MatterJS.BodyType;
      const a = this.balls.balls.get(bodyA.parent.id);
      const b = this.balls.balls.get(bodyB.parent.id);
      if (!a || !b || a.id === b.id || a.level !== b.level || a.merging || b.merging) continue;
      // Lock inside the collision callback; mutation happens only after Engine.update.
      a.merging = b.merging = true;
      this.pending.push([a.id, b.id]);
    }
  }

  flush(time: number): void {
    const pairs = this.pending;
    this.pending = [];
    for (const [aId, bId] of pairs) {
      const a = this.balls.balls.get(aId);
      const b = this.balls.balls.get(bId);
      if (!a || !b) {
        if (a) a.merging = false;
        if (b) b.merging = false;
        continue;
      }
      const next = nextLevel(a.level);
      const maximum = next === null;
      const level = next ?? a.level;
      const config = levelConfig(level);
      const centerX = (a.body.position.x + b.body.position.x) / 2;
      const centerY = (a.body.position.y + b.body.position.y) / 2;
      let x = centerX;
      let y = centerY;
      const velocity = {
        x: Phaser.Math.Clamp((a.body.velocity.x + b.body.velocity.x) * 0.36, -4, 4),
        y: Phaser.Math.Clamp((a.body.velocity.y + b.body.velocity.y) * 0.36, -3, 6),
      };
      const angularVelocity = Phaser.Math.Clamp((a.body.angularVelocity + b.body.angularVelocity) * 0.3, -0.04, 0.04);
      this.balls.remove(a);
      this.balls.remove(b);
      if (!maximum) {
        const merged = this.balls.create(level, x, y, time, true);
        x = merged.body.position.x;
        y = merged.body.position.y;
        this.scene.matter.body.setVelocity(merged.body, velocity);
        this.scene.matter.body.setAngularVelocity(merged.body, angularVelocity);
      }
      this.onMerge({ x, y, level, points: config.points, maximum });
    }
  }

  clear(): void { this.pending = []; }
}
