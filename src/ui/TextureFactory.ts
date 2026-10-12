import Phaser from 'phaser';
import { LEVELS, levelConfig } from '../config/gameConfig';
import { drawMemeCutout } from './MemeArtwork';
import { cacheMemeShape } from '../game/MemeShape';

export const memeTexture = (level: number): string => `meme-circle-${level}`;

/** Cache cutout photos once; only missing levels use numbered colored disks. */
export function createMemeTextures(scene: Phaser.Scene): void {
  for (const config of LEVELS) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D недоступен');
    const radius = size / 2 - 4;
    const center = size / 2;
    const sourceKey = `source-${config.level}`;
    if (scene.textures.exists(sourceKey)) {
      const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
      drawMemeCutout(ctx, source, config.color, size);
      scene.textures.addCanvas(memeTexture(config.level), canvas);
      cacheMemeShape(scene, config.level, canvas);
      scene.textures.remove(sourceKey);
      continue;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.clip();
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, config.color);
    gradient.addColorStop(1, config.color + 'c4');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    // Clearly numbered temporary artwork; no network resources or generated people.
    drawPlaceholder(ctx, config.level, size);
    ctx.restore();
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(center, center, radius - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(center, center, radius - 13, Math.PI * 1.15, Math.PI * 1.48);
    ctx.stroke();
    scene.textures.addCanvas(memeTexture(config.level), canvas);
    cacheMemeShape(scene, config.level, canvas, true);
    if (scene.textures.exists(sourceKey)) scene.textures.remove(sourceKey);
  }
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, level: number, size: number): void {
  const center = size / 2;
  ctx.fillStyle = '#24233a';
  const eyeY = 102;
  const eyeSpread = 34 + (level % 3) * 3;
  for (const x of [center - eyeSpread, center + eyeSpread]) {
    ctx.beginPath();
    ctx.ellipse(x, eyeY, 8 + level % 3, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.arc(x - 2, eyeY - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#24233a';
  }
  ctx.strokeStyle = '#24233a';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(center - 20, 137);
  ctx.quadraticCurveTo(center, level % 2 ? 163 : 150, center + 20, 137);
  ctx.stroke();
  ctx.fillStyle = 'rgba(36,35,58,.13)';
  for (const x of [center - 64, center + 64]) {
    ctx.beginPath();
    ctx.ellipse(x, 128, 17, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = '800 38px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#24233a';
  ctx.fillText(String(level).padStart(2, '0'), center, 207);
}

/** Reuse the exact same cached, masked artwork in accessible HTML UI. */
export function textureDataUrl(scene: Phaser.Scene, level: number): string {
  levelConfig(level);
  const canvas = scene.textures.get(memeTexture(level)).getSourceImage() as HTMLCanvasElement;
  return canvas.toDataURL('image/png');
}
