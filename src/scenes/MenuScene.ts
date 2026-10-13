import Phaser from 'phaser';
import { ui } from '../ui/GameUI';
import { audio } from '../services/AudioManager';
import { platform } from '../services/PlatformService';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }
  create(): void {
    audio.setSuspended('game', false);
    ui.menu(() => this.scene.start('Game'));
    platform.ready();
  }
}
