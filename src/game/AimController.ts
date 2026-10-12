import { GAME } from '../config/gameConfig';

interface Point { x: number; y: number }
interface AimActions {
  canDrop(): boolean;
  contains(point: Point): boolean;
  aim(x: number, snap?: boolean): void;
  drop(point: Point): void;
}

/** One canvas gesture owns its pointer until release, including outside the board. */
export class AimController {
  private pointerId: number | null = null;

  constructor(private canvas: HTMLCanvasElement, private actions: AimActions) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('lostpointercapture', this.lostCapture);
    // Document listeners also cover browsers that decline capture, without tracking a second finger.
    document.addEventListener('pointermove', this.move, { passive: false });
    document.addEventListener('pointerup', this.up);
    document.addEventListener('pointercancel', this.cancelEvent);
  }

  get activePointer(): number | null { return this.pointerId; }

  cancel(): void {
    const id = this.pointerId;
    this.pointerId = null;
    if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }

  destroy(): void {
    this.cancel();
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('lostpointercapture', this.lostCapture);
    document.removeEventListener('pointermove', this.move);
    document.removeEventListener('pointerup', this.up);
    document.removeEventListener('pointercancel', this.cancelEvent);
  }

  private point(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * GAME.width / rect.width, y: (event.clientY - rect.top) * GAME.height / rect.height };
  }

  private down = (event: PointerEvent): void => {
    if (!event.isPrimary || this.pointerId !== null || !this.actions.canDrop()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = this.point(event);
    if (!this.actions.contains(point)) return;
    event.preventDefault();
    this.actions.aim(point.x, true);
    if (event.pointerType === 'mouse') {
      // Preserve the desktop click-to-drop interaction.
      this.actions.drop(point);
      return;
    }
    this.pointerId = event.pointerId;
    try { this.canvas.setPointerCapture(event.pointerId); }
    catch { /* Document listeners still finish the active gesture. */ }
  };

  private move = (event: PointerEvent): void => {
    if (!this.actions.canDrop()) return;
    const point = this.point(event);
    if (this.pointerId === event.pointerId) {
      event.preventDefault();
      this.actions.aim(point.x);
    } else if (this.pointerId === null && event.pointerType === 'mouse' && event.target === this.canvas && this.actions.contains(point)) {
      this.actions.aim(point.x);
    }
  };

  private up = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    const point = this.point(event);
    this.cancel();
    if (!this.actions.canDrop()) return;
    this.actions.aim(point.x, true);
    this.actions.drop(point);
  };

  private cancelEvent = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.cancel();
  };
  private lostCapture = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.cancel();
  };
}
