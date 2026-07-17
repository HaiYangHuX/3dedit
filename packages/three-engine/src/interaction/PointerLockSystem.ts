import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import type { Camera } from 'three';

const POINTER_LOCK_MOVE_SPEED = 0.1 * 48;

export interface PointerLockSystemOptions {
  onStateChange?(active: boolean): void;
  onChange?(): void;
}

/** 源站第一人称模式的每帧移动距离，保持 delta * 0.1 * 48 的计算方式。 */
export function calculatePointerLockMove(deltaSeconds: number): number {
  return Math.max(deltaSeconds, 0) * POINTER_LOCK_MOVE_SPEED;
}

/**
 * 封装 PointerLockControls 的创建、键盘移动和销毁。
 * OrbitControls 与第一人称控制器不能同时更新，调用方应以 isLocked 选择唯一控制路径。
 */
export class PointerLockSystem {
  readonly controls: PointerLockControls;
  private active = false;
  private readonly keys = new Set<string>();

  constructor(
    camera: Camera,
    domElement: HTMLElement,
    private readonly options: PointerLockSystemOptions = {},
  ) {
    this.controls = new PointerLockControls(camera, domElement);
    this.controls.addEventListener('lock', this.handleLock);
    this.controls.addEventListener('unlock', this.handleUnlock);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  get isActive(): boolean {
    return this.active;
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  activate(): void {
    if (this.active) return;
    // 源站创建第一人称控制器时把相机高度约束在 2～6 之间，避免从地面切入模型。
    this.controls.object.position.y = Math.min(
      Math.max(this.controls.object.position.y, 2),
      6,
    );
    this.setActive(true);
    this.controls.lock();
  }

  deactivate(): void {
    if (!this.active && !this.controls.isLocked) return;
    if (this.controls.isLocked) this.controls.unlock();
    this.setActive(false);
    this.keys.clear();
  }

  toggle(): boolean {
    if (this.active) this.deactivate();
    else this.activate();
    return this.active;
  }

  update(deltaSeconds: number): void {
    if (!this.controls.isLocked) return;
    const distance = calculatePointerLockMove(deltaSeconds);
    if (this.keys.has('w')) this.controls.moveForward(distance);
    if (this.keys.has('s')) this.controls.moveForward(-distance);
    if (this.keys.has('a')) this.controls.moveRight(-distance);
    if (this.keys.has('d')) this.controls.moveRight(distance);
    if (distance > 0) this.options.onChange?.();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.controls.removeEventListener('lock', this.handleLock);
    this.controls.removeEventListener('unlock', this.handleUnlock);
    if (this.controls.isLocked) this.controls.unlock();
    this.controls.dispose();
    this.keys.clear();
    this.active = false;
  }

  private readonly handleLock = (): void => {
    this.setActive(true);
    this.options.onChange?.();
  };

  private readonly handleUnlock = (): void => {
    this.setActive(false);
    this.keys.clear();
    this.options.onChange?.();
  };

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.options.onStateChange?.(active);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key.length === 1) this.keys.add(event.key.toLowerCase());
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key.length === 1) this.keys.delete(event.key.toLowerCase());
  };
}
