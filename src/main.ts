import Phaser from 'phaser';
import './style.css';
import { GAME, PHYSICS } from './config/gameConfig';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { audio } from './services/AudioManager';
import { DECORATIONS } from './config/assets';

for (const [side, source] of Object.entries(DECORATIONS)) {
  const decoration = document.querySelector<HTMLImageElement>(`[data-decoration="${side}"]`);
  if (decoration) decoration.src = source;
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME.width,
  height: GAME.height,
  transparent: true,
  antialias: true,
  audio: { noAudio: true },
  input: { activePointers: 2 },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME.width, height: GAME.height },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: PHYSICS.gravity },
      autoUpdate: false,
      enableSleeping: true,
      positionIterations: 10,
      velocityIterations: 8,
    },
  },
  scene: [BootScene, MenuScene, GameScene],
});
game.events.once(Phaser.Core.Events.DESTROY, () => audio.destroy());

const stage = document.getElementById('stage')!;
const uiElement = document.getElementById('ui')!;
new ResizeObserver(() => {
  const scale = stage.clientWidth / GAME.width;
  uiElement.style.transform = `scale(${scale})`;
  uiElement.style.setProperty('--tap-size', `${Math.max(44, 44 / scale)}px`);
  uiElement.classList.toggle('compact', scale < 0.8);
  uiElement.classList.toggle('very-compact', scale < 0.6);
}).observe(stage);

// Fixture controls are tree-shaken from production; actual collisions drive test assertions.
if (import.meta.env.DEV && import.meta.env.VITE_TEST_MODE === '1') {
  void import('./testing').then(({ attachTestApi }) => attachTestApi(game));
}
