/**
 * Office — Phaser 3 isometric office visualization.
 *
 * Uses Phaser's scene system with Kenney CC0 isometric sprites.
 * - Native depth sorting
 * - Tween-based animations
 * - Camera zoom/pan
 * - Sprite tinting for agent differentiation
 */

import Phaser from 'phaser';
import { OfficeScene } from './office-scene.js';
import type { ShemEvent } from '../types/events.js';

export class Office {
  public game: Phaser.Game | null = null;
  public scene: OfficeScene | null = null;
  private initialized = false;

  async init(container: HTMLDivElement): Promise<void> {
    if (this.initialized) return;

    const scene = new OfficeScene();
    this.scene = scene;

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
      backgroundColor: '#111118',
      pixelArt: true,
      scene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      audio: { noAudio: true },
    });

    // Wait for scene to be ready
    await new Promise<void>((resolve) => {
      const check = () => {
        if (scene.scene?.isActive()) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    this.initialized = true;
  }

  handleEvent(event: ShemEvent): void {
    this.scene?.handleEvent(event);
  }

  resize(width: number, height: number): void {
    this.game?.scale.resize(width, height);
  }

  destroy(): void {
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
    this.initialized = false;
  }
}
