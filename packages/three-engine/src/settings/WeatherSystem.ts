import type { SceneSettings } from '@digital-twin/scene-schema';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  LinearFilter,
  Points,
  PointsMaterial,
  RGBAFormat,
  TextureLoader,
  type Scene,
  type Texture,
} from 'three';
import { WEATHER_ASSETS } from './builtinAssets.js';

export interface WeatherTextureLoader {
  loadAsync(url: string): Promise<Texture>;
}

export interface WeatherSystemOptions {
  textureLoader?: WeatherTextureLoader;
  random?: () => number;
}

interface WeatherState {
  type: Exclude<SceneSettings['weatherType'], 'none'>;
  points: Points<BufferGeometry, PointsMaterial>;
  positions: Float32Array;
  colors: Float32Array;
  velocity: Float32Array;
  drift: Float32Array;
  baseX: Float32Array;
  baseZ: Float32Array;
  waveFrequency: Float32Array;
  waveAmplitude: Float32Array;
  speed: number;
  area: number;
  height: number;
  windX: number;
  windZ: number;
}

/** 雨雪共用一个 Points 系统，帧更新由 Engine 唯一 RAF 驱动。 */
export class WeatherSystem {
  private readonly textureLoader: WeatherTextureLoader;
  private readonly random: () => number;
  private state?: WeatherState;
  private generation = 0;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    options: WeatherSystemOptions = {},
  ) {
    this.textureLoader = options.textureLoader ?? new TextureLoader();
    this.random = options.random ?? Math.random;
  }

  async apply(settings: SceneSettings): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    if (settings.weatherType === 'none') {
      this.clear();
      return;
    }

    const texture = await this.textureLoader.loadAsync(
      WEATHER_ASSETS[settings.weatherType],
    );
    if (this.disposed || generation !== this.generation) {
      texture.dispose();
      return;
    }
    const next = this.createState(settings, texture);
    if (this.disposed || generation !== this.generation) {
      this.disposeState(next);
      return;
    }
    this.clear();
    this.state = next;
    this.scene.add(next.points);
  }

  update(delta: number, elapsed: number): void {
    const state = this.state;
    if (!state) return;
    const {
      points,
      positions,
      colors,
      velocity,
      baseX,
      baseZ,
      area,
      height,
      windX,
      windZ,
    } = state;
    // 源站速度按 60 FPS 的每帧位移定义，这里换算为帧率无关的 delta。
    const frameScale = Math.max(0, delta) * 60;
    const halfArea = area / 2;
    const fadeHeight = height * 0.15;

    if (state.type === 'rain') {
      points.rotation.z = Math.atan2(windX, state.speed);
      points.rotation.x = -Math.atan2(windZ, state.speed);
      for (let index = 0; index < velocity.length; index += 1) {
        const offset = index * 3;
        positions[offset + 1]! -= velocity[index]! * frameScale;
        positions[offset] = baseX[index]!;
        positions[offset + 2] = baseZ[index]!;
        if (positions[offset + 1]! < 0) {
          positions[offset + 1] = height;
          baseX[index] = (this.random() - 0.5) * area;
          baseZ[index] = (this.random() - 0.5) * area;
        }
        this.writeFade(
          colors,
          offset,
          positions[offset + 1]!,
          height,
          fadeHeight,
        );
      }
    } else {
      points.rotation.set(0, 0, 0);
      for (let index = 0; index < velocity.length; index += 1) {
        const offset = index * 3;
        positions[offset + 1]! -= velocity[index]! * frameScale;
        baseX[index]! += windX * velocity[index]! * frameScale;
        baseZ[index]! += windZ * velocity[index]! * frameScale;
        if (baseX[index]! > halfArea) baseX[index] = -halfArea;
        else if (baseX[index]! < -halfArea) baseX[index] = halfArea;
        if (baseZ[index]! > halfArea) baseZ[index] = -halfArea;
        else if (baseZ[index]! < -halfArea) baseZ[index] = halfArea;
        const frequency = state.waveFrequency[index]!;
        const amplitude = state.waveAmplitude[index]!;
        const phase = state.drift[index]!;
        const xWave =
          Math.sin(elapsed * frequency + phase) * amplitude +
          Math.sin(elapsed * frequency * 0.5 + phase) * (amplitude * 0.3);
        const zWave =
          Math.cos(elapsed * frequency + phase) * amplitude +
          Math.sin(elapsed * frequency * 0.3 + phase) * (amplitude * 0.3);
        positions[offset] = baseX[index]! + xWave;
        positions[offset + 2] = baseZ[index]! + zWave;
        if (positions[offset + 1]! < 0) {
          positions[offset + 1] = height;
          baseX[index] = (this.random() - 0.5) * area;
          baseZ[index] = (this.random() - 0.5) * area;
        }
        this.writeFade(
          colors,
          offset,
          positions[offset + 1]!,
          height,
          fadeHeight,
        );
      }
    }
    points.geometry.getAttribute('position').needsUpdate = true;
    points.geometry.getAttribute('color').needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.clear();
  }

  private createState(settings: SceneSettings, texture: Texture): WeatherState {
    const type = settings.weatherType;
    if (type === 'none') throw new Error('无天气不应创建粒子');
    const count = settings.weatherCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocity = new Float32Array(count);
    const drift = new Float32Array(count);
    const baseX = new Float32Array(count);
    const baseZ = new Float32Array(count);
    const waveFrequency = new Float32Array(count);
    const waveAmplitude = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const x = (this.random() - 0.5) * settings.weatherArea;
      const z = (this.random() - 0.5) * settings.weatherArea;
      baseX[index] = x;
      baseZ[index] = z;
      positions[offset] = x;
      positions[offset + 1] = this.random() * settings.weatherHeight;
      positions[offset + 2] = z;
      velocity[index] = settings.weatherSpeed * (0.8 + this.random() * 0.4);
      drift[index] = this.random() * Math.PI * 2;
      waveFrequency[index] = 1 + this.random() * 2;
      waveAmplitude[index] = 0.05 + this.random() * 0.2;
      colors[offset] = 1;
      colors[offset + 1] = 1;
      colors[offset + 2] = 1;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    if (type === 'snow') {
      texture.premultiplyAlpha = true;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.format = RGBAFormat;
      texture.needsUpdate = true;
    }
    const material = new PointsMaterial({
      color: '#ffffff',
      size: settings.weatherSize,
      map: texture,
      transparent: true,
      opacity: settings.weatherOpacity,
      depthWrite: false,
      blending: AdditiveBlending,
      alphaTest: 0.01,
      sizeAttenuation: true,
      vertexColors: true,
    });
    const points = new Points(geometry, material);
    points.name = '__weather__';
    points.userData.type = 'weather';
    // 天气是场景效果而非业务节点，不能拦截编辑器或运行时射线。
    points.raycast = () => undefined;
    return {
      type,
      points,
      positions,
      colors,
      velocity,
      drift,
      baseX,
      baseZ,
      waveFrequency,
      waveAmplitude,
      speed: settings.weatherSpeed,
      area: settings.weatherArea,
      height: settings.weatherHeight,
      windX: type === 'rain' ? 0.05 : 0.02,
      windZ: type === 'rain' ? 0.02 : 0.01,
    };
  }

  private writeFade(
    colors: Float32Array,
    offset: number,
    y: number,
    height: number,
    fadeHeight: number,
  ): void {
    let alpha = 1;
    if (fadeHeight > 0) {
      if (y > height - fadeHeight) alpha = (height - y) / fadeHeight;
      else if (y < fadeHeight) alpha = y / fadeHeight;
    }
    alpha = Math.max(0, Math.min(1, alpha));
    colors[offset] = alpha;
    colors[offset + 1] = alpha;
    colors[offset + 2] = alpha;
  }

  private clear(): void {
    if (!this.state) return;
    this.disposeState(this.state);
    this.state = undefined;
  }

  private disposeState(state: WeatherState): void {
    state.points.removeFromParent();
    state.points.geometry.dispose();
    state.points.material.map?.dispose();
    state.points.material.dispose();
  }
}
