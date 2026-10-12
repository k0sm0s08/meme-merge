import Phaser from 'phaser';
import { ui } from '../ui/GameUI';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }
  create(): void {
    ui.menu(() => this.scene.start('Game'));
  }
}
