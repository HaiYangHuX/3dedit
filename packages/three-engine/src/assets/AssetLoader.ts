import { Mesh, MeshStandardMaterial, type WebGLRenderer } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { USDZLoader } from 'three/addons/loaders/USDZLoader.js';
import type { AssetDescriptor, AssetLoaderLike, LoadedAsset } from './types.js';

export interface AssetLoaderOptions {
  renderer?: WebGLRenderer;
  dracoDecoderPath?: string;
  ktx2TranscoderPath?: string;
}

export const DEFAULT_DRACO_DECODER_PATH = '/decoders/draco/';
export const DEFAULT_KTX2_TRANSCODER_PATH = '/decoders/basis/';

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/**
 * Three.js r183 多格式加载边界。
 * Loader 自身无法可靠取消所有子请求，因此调用方还必须使用加载代次处理迟到结果。
 */
export class AssetLoader implements AssetLoaderLike {
  private readonly draco = new DRACOLoader();
  private readonly ktx2 = new KTX2Loader();
  private readonly gltf = new GLTFLoader();
  private readonly fbx = new FBXLoader();
  private readonly obj = new OBJLoader();
  private readonly stl = new STLLoader();
  private readonly usdz = new USDZLoader();

  constructor(options: AssetLoaderOptions = {}) {
    this.draco.setDecoderPath(
      options.dracoDecoderPath ?? DEFAULT_DRACO_DECODER_PATH,
    );
    this.ktx2.setTranscoderPath(
      options.ktx2TranscoderPath ?? DEFAULT_KTX2_TRANSCODER_PATH,
    );
    if (options.renderer) this.ktx2.detectSupport(options.renderer);
    this.gltf.setDRACOLoader(this.draco);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    if (options.renderer) this.gltf.setKTX2Loader(this.ktx2);
  }

  async load(
    descriptor: AssetDescriptor,
    signal?: AbortSignal,
  ): Promise<LoadedAsset> {
    abortIfNeeded(signal);
    let loaded: LoadedAsset;
    switch (descriptor.format) {
      case 'glb':
      case 'gltf': {
        const gltf = await this.gltf.loadAsync(descriptor.url);
        loaded = { root: gltf.scene, animations: gltf.animations };
        break;
      }
      case 'fbx': {
        const root = await this.fbx.loadAsync(descriptor.url);
        loaded = { root, animations: root.animations };
        break;
      }
      case 'obj': {
        const root = await this.obj.loadAsync(descriptor.url);
        loaded = { root, animations: [] };
        break;
      }
      case 'stl': {
        const geometry = await this.stl.loadAsync(descriptor.url);
        geometry.computeVertexNormals();
        loaded = {
          root: new Mesh(
            geometry,
            new MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.75 }),
          ),
          animations: [],
        };
        break;
      }
      case 'usdz': {
        const root = await this.usdz.loadAsync(descriptor.url);
        loaded = { root, animations: [] };
        break;
      }
      case 'hdr':
        throw new Error('HDR 资源必须由 SceneSettingsSystem 加载');
    }
    abortIfNeeded(signal);
    loaded.root.name = descriptor.name;
    loaded.root.userData.assetId = descriptor.assetId;
    loaded.root.userData.assetFormat = descriptor.format;
    return loaded;
  }

  dispose(): void {
    this.draco.dispose();
    this.ktx2.dispose();
  }
}
