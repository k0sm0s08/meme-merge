import Phaser from 'phaser';
import { createMemeTextures } from '../ui/TextureFactory';
import { ui } from '../ui/GameUI';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload(): void {
    for (const level of __MEME_ASSETS__) {
      this.load.image(`source-${level}`, `${import.meta.env.BASE_URL}assets/memes/meme-${String(level).padStart(2, '0')}.png`);
    }
    this.load.on('progress', (progress: number) => {
      const bar = document.querySelector<HTMLElement>('.loading-track span');
      if (bar) bar.style.width = `${progress * 100}%`;
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`Не удалось загрузить ${file.key}; используется временный круг.`);
    });
  }

  create(): void {
    createMemeTextures(this);
    ui.cacheArtwork(this);
    document.getElementById('loading')?.remove();
    this.scene.start('Menu');
  }
}
