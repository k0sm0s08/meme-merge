import type Phaser from 'phaser';

/** No graphics or per-frame geometry work is allocated unless explicitly requested. */
export class PhysicsDebug {
  readonly enabled = new URLSearchParams(location.search).get('debugPhysics') === '1';
  private graphics?: Phaser.GameObjects.Graphics;
  private legend?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    if (!this.enabled) return;
    this.graphics = scene.add.graphics().setDepth(20);
    this.legend = scene.add.text(28, 724, 'PHYSICS · контур тела / центр массы / стенки', { fontFamily: 'system-ui', fontSize: '8px', color: '#dac594' }).setDepth(21);
  }

  draw(bodies: MatterJS.BodyType[]): void {
    const graphics = this.graphics;
    if (!graphics) return;
    graphics.clear();
    for (const body of bodies) {
      graphics.lineStyle(body.isStatic ? 1.5 : 1, body.isStatic ? 0x9dcbbd : 0xe0bc7b, 0.85);
      const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
      for (const part of parts) {
        const vertices = part.vertices!;
        graphics.strokePoints(vertices, true);
      }
      if (!body.isStatic) graphics.fillStyle(0xf0dbb3).fillCircle(body.position.x, body.position.y, 1.5);
    }
  }

  destroy(): void { this.graphics?.destroy(); this.legend?.destroy(); }
}
