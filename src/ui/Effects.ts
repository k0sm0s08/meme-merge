import Phaser from 'phaser';
import { levelConfig } from '../config/gameConfig';
import type { MergeResult } from '../game/MergeManager';

export class Effects {
  private active: Phaser.GameObjects.GameObject[] = [];
  private lowMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private scene: Phaser.Scene) {}

  merge(result: MergeResult, combo: number): void {
    const color = Phaser.Display.Color.HexStringToColor(levelConfig(result.level).color).color;
    if (this.active.length < 65) {
      const ring = this.scene.add.circle(result.x, result.y, 12, color, 0.08).setStrokeStyle(2, color, 0.55).setDepth(8);
      this.track(ring);
      this.scene.tweens.add({ targets: ring, scale: this.lowMotion ? 1.5 : result.maximum ? 7 : 3, alpha: 0, duration: 350, onComplete: () => this.remove(ring) });
      const count = this.lowMotion ? 2 : result.maximum ? 16 : 6;
      for (let i = 0; i < count; i++) {
        const angle = Math.PI * 2 * i / count;
        const particle = this.scene.add.circle(result.x, result.y, i % 2 ? 2 : 3, color, 0.65).setDepth(9);
        this.track(particle);
        const distance = result.maximum ? 85 : 32;
        this.scene.tweens.add({ targets: particle, x: result.x + Math.cos(angle) * distance, y: result.y + Math.sin(angle) * distance, alpha: 0, scale: 0.4, duration: 400, onComplete: () => this.remove(particle) });
      }
    }
    const label = this.scene.add.text(result.x, result.y - 15, result.maximum ? `ЛЕГЕНДА! +${result.points}` : `+${result.points}${combo > 1 ? `  ×${combo}` : ''}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: result.maximum ? '19px' : '17px', fontStyle: 'bold', color: levelConfig(result.level).color,
      stroke: '#303942', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);
    label.x = Phaser.Math.Clamp(label.x, label.width / 2 + 10, 380 - label.width / 2);
    this.track(label);
    this.scene.tweens.add({ targets: label, y: label.y - 36, alpha: 0, duration: 650, ease: 'Cubic.Out', onComplete: () => this.remove(label) });
  }

  clear(): void {
    for (const object of this.active) {
      this.scene.tweens.killTweensOf(object);
      object.destroy();
    }
    this.active = [];
  }

  private track(object: Phaser.GameObjects.GameObject): void { this.active.push(object); }
  private remove(object: Phaser.GameObjects.GameObject): void {
    this.active = this.active.filter((item) => item !== object);
    object.destroy();
  }
}
