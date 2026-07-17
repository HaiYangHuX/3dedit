import type { SceneSettings } from '@digital-twin/scene-schema';
import {
  Color,
  DodecahedronGeometry,
  DoubleSide,
  GridHelper,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshPhongMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  type BufferGeometry,
  type LineBasicMaterial,
  type Material,
  type Scene,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  GROUND_ASSETS,
  LAWN_MODEL_ASSETS,
  type GroundAssetDefinition,
} from './builtinAssets.js';
import { disposeObjectTree } from './disposeObjectTree.js';
import { SIMPLEX_2D_GLSL } from './groundShaders.js';

export interface GroundTextureLoader {
  loadAsync(url: string): Promise<Texture>;
}

export interface GroundModelLoader {
  loadAsync(url: string): Promise<{ scene: Group }>;
}

export interface GroundSystemOptions {
  textureLoader?: GroundTextureLoader;
  modelLoader?: GroundModelLoader;
  random?: () => number;
}

type GroundType = SceneSettings['groundType'];
type WindMaterial = MeshPhongMaterial & {
  userData: {
    shader?: WebGLProgramParametersWithUniforms;
    windTime?: number;
    [key: string]: unknown;
  };
};

const GROUND_NAME = 'customPlane';
const LAWN_NOISE_SCALE = 5;
const LAWN_PATCHINESS = 0.7;
const LAWN_TEXTURE_SCALE = 0.5;
const LAWN_SCALE_UNIT = (LAWN_NOISE_SCALE / 100) * 1.6;

/** CPU 端 simplex 与 shader 使用同一常量，使草叶/岩石分布与地表斑块对齐。 */
function simplex2d(x: number, y: number): number {
  const c0 = 0.211324865405187;
  const c1 = 0.366025403784439;
  const c2 = -0.577350269189626;
  const c3 = 0.024390243902439;
  const skew = c1 * (x + y);
  let i = Math.floor(x + skew);
  let j = Math.floor(y + skew);
  const unskew = c0 * (i + j);
  const x0 = x - i + unskew;
  const y0 = y - j + unskew;
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 + c0 - i1;
  const y1 = y0 + c0 - j1;
  const x2 = x0 + c2;
  const y2 = y0 + c2;
  i -= Math.floor(i / 289) * 289;
  j -= Math.floor(j / 289) * 289;
  const mod289 = (value: number) => value - Math.floor(value / 289) * 289;
  const permute = (value: number) => mod289((value * 34 + 1) * value);
  const hashes = [
    permute(permute(j) + i),
    permute(permute(j + j1) + i + i1),
    permute(permute(j + 1) + i + 1),
  ];
  const positions = [
    [x0, y0],
    [x1, y1],
    [x2, y2],
  ];
  let result = 0;
  for (let index = 0; index < 3; index += 1) {
    const [px = 0, py = 0] = positions[index] ?? [];
    let attenuation = Math.max(0, 0.5 - px * px - py * py);
    attenuation **= 4;
    const gradientX = 2 * (((hashes[index] ?? 0) * c3) % 1) - 1;
    const gradientY = Math.abs(gradientX) - 0.5;
    const offsetX = gradientX - Math.floor(gradientX + 0.5);
    const normalization =
      1.79284291400159 -
      0.85373472095314 * (offsetX * offsetX + gradientY * gradientY);
    result += attenuation * normalization * (offsetX * px + gradientY * py);
  }
  return 130 * result;
}

function fractalNoise(x: number, y: number): number {
  let result = 0;
  let amplitude = 0.5;
  let currentX = x;
  let currentY = y;
  for (let octave = 0; octave < 4; octave += 1) {
    result += amplitude * simplex2d(currentX, currentY);
    const rotatedX = 0.8 * currentX - 0.6 * currentY;
    const rotatedY = 0.6 * currentX + 0.8 * currentY;
    currentX = rotatedX * 2.1;
    currentY = rotatedY * 2.1;
    amplitude *= 0.5;
  }
  return result;
}

function firstMaterial(object: Mesh): Material | undefined {
  return Array.isArray(object.material) ? object.material[0] : object.material;
}

function materialMap(material: Material | undefined): Texture | null {
  if (!material || !('map' in material)) return null;
  return material.map instanceof Texture ? material.map : null;
}

function firstMesh(root: Object3D): Mesh | undefined {
  let result: Mesh | undefined;
  root.traverse((object) => {
    if (!result && object instanceof Mesh) result = object;
  });
  return result;
}

/** 拥有当前地面根、内置纹理/GLB 以及草坪风摆 shader 的完整生命周期。 */
export class GroundSystem {
  private readonly textureLoader: GroundTextureLoader;
  private readonly modelLoader: GroundModelLoader;
  private readonly random: () => number;
  private currentRoot?: Object3D;
  private currentType: GroundType = 'none';
  private generation = 0;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    options: GroundSystemOptions = {},
  ) {
    this.textureLoader = options.textureLoader ?? new TextureLoader();
    this.modelLoader = options.modelLoader ?? new GLTFLoader();
    this.random = options.random ?? Math.random;
  }

  async apply(type: GroundType): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    if (
      type === this.currentType &&
      ((type === 'none' && !this.currentRoot) || this.currentRoot)
    ) {
      return;
    }
    if (type === 'none') {
      this.replaceCurrent(undefined, type);
      return;
    }
    const next =
      type === 'grid' ? this.createGrid() : await this.createGround(type);
    if (generation !== this.generation || this.disposed) {
      disposeObjectTree(next);
      return;
    }
    this.replaceCurrent(next, type);
  }

  update(elapsed: number): void {
    const materials = this.currentRoot?.userData.windMaterials as
      WindMaterial[] | undefined;
    for (const material of materials ?? []) {
      // windTime 也保留在 userData，便于 shader 编译前调试和回归测试。
      material.userData.windTime = elapsed;
      const uniform = material.userData.shader?.uniforms.uTime;
      if (uniform) uniform.value = elapsed;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.replaceCurrent(undefined, 'none');
  }

  private replaceCurrent(next: Object3D | undefined, type: GroundType): void {
    const previous = this.currentRoot;
    this.currentRoot = next;
    this.currentType = type;
    if (next) this.scene.add(next);
    if (previous && previous !== next) disposeObjectTree(previous);
  }

  private createGrid(): Group {
    const root = new Group();
    root.name = '__ground_grid__';
    root.userData.isGridHelper = true;
    root.userData.groundType = 'grid';
    const fine = new GridHelper(200, 2_000);
    const fineMaterial = fine.material as LineBasicMaterial;
    fineMaterial.transparent = true;
    fineMaterial.opacity = 0.1;
    fineMaterial.depthWrite = false;
    fineMaterial.color.setHex(0xaaaaaa);
    fineMaterial.vertexColors = false;
    fine.renderOrder = -1;
    const main = new GridHelper(200, 200);
    const mainMaterial = main.material as LineBasicMaterial;
    mainMaterial.transparent = true;
    mainMaterial.opacity = 0.3;
    mainMaterial.color.setHex(0xffffff);
    mainMaterial.vertexColors = false;
    main.renderOrder = -1;
    root.add(fine, main);
    return root;
  }

  private createGround(
    type: Exclude<GroundType, 'none' | 'grid'>,
  ): Promise<Object3D> {
    const asset = GROUND_ASSETS[type];
    if (type === 'lawn') return this.createLawn(asset);
    if (type === 'rock') return this.createRock(asset);
    if (type === 'stone') return this.createStone(asset);
    return this.createTiledGround(type, asset);
  }

  private async loadTexturePair(
    asset: GroundAssetDefinition,
  ): Promise<[Texture, Texture]> {
    const results = await Promise.allSettled([
      this.textureLoader.loadAsync(asset.mapUrl),
      this.textureLoader.loadAsync(asset.normalMapUrl),
    ]);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (rejected) {
      for (const result of results) {
        if (result.status === 'fulfilled') result.value.dispose();
      }
      throw rejected.reason;
    }
    const [mapResult, normalResult] = results;
    if (
      mapResult?.status !== 'fulfilled' ||
      normalResult?.status !== 'fulfilled'
    ) {
      throw new Error('地面纹理加载结果缺失');
    }
    return [mapResult.value, normalResult.value];
  }

  private configureTexture(
    texture: Texture,
    color: boolean,
    anisotropy = 8,
  ): void {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = anisotropy;
    if (color) texture.colorSpace = SRGBColorSpace;
  }

  private async createTiledGround(
    type: 'floor' | 'tile-1' | 'tile-2' | 'brick',
    asset: GroundAssetDefinition,
  ): Promise<Mesh> {
    const [map, normalMap] = await this.loadTexturePair(asset);
    this.configureTexture(map, true, 16);
    map.repeat.set(1_000, 1_000);
    const material = new MeshStandardMaterial({
      color: '#ffffff',
      map,
      normalMap,
      roughness: 0.8,
      metalness: 0.2,
      side: DoubleSide,
    });
    const mesh = new Mesh(new PlaneGeometry(1_500, 1_500), material);
    mesh.name = GROUND_NAME;
    mesh.userData.planeGeometry = type;
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  private async createLawn(asset: GroundAssetDefinition): Promise<Group> {
    if (!asset.dirtMapUrl) throw new Error('草坪地面缺少泥土纹理');
    const [[grassMap, normalMap], dirtMap, grassGltf, flowerGltfs] =
      await Promise.all([
        this.loadTexturePair(asset),
        this.textureLoader.loadAsync(asset.dirtMapUrl),
        this.modelLoader.loadAsync(LAWN_MODEL_ASSETS.grass),
        Promise.all(
          LAWN_MODEL_ASSETS.flowers.map((url) =>
            this.modelLoader.loadAsync(url),
          ),
        ),
      ]);
    this.configureTexture(grassMap, true);
    this.configureTexture(dirtMap, true);
    this.configureTexture(normalMap, false);
    const groundMaterial = new MeshPhongMaterial({
      emissive: 0xffffff,
      emissiveIntensity: 0.01,
      normalMap,
      shininess: 0.1,
    }) as MeshPhongMaterial & { grassMap: Texture; dirtMap: Texture };
    groundMaterial.grassMap = grassMap;
    groundMaterial.dirtMap = dirtMap;
    groundMaterial.customProgramCacheKey = () => 'lawn-ground';
    groundMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uNoiseScale = { value: LAWN_NOISE_SCALE };
      shader.uniforms.uPatchiness = { value: LAWN_PATCHINESS };
      shader.uniforms.uGrassTexture = { value: grassMap };
      shader.uniforms.uDirtTexture = { value: dirtMap };
      shader.vertexShader =
        'varying vec3 vLawnWorldPos;\n' + shader.vertexShader;
      shader.fragmentShader =
        `varying vec3 vLawnWorldPos;\nuniform float uNoiseScale;\nuniform float uPatchiness;\nuniform sampler2D uGrassTexture;\nuniform sampler2D uDirtTexture;\n` +
        shader.fragmentShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvLawnWorldPos = worldPosition.xyz;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `${SIMPLEX_2D_GLSL}\nvoid main() {`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `vec2 uv = vec2(vLawnWorldPos.x, vLawnWorldPos.z);
         vec3 grassColor = texture2D(uGrassTexture, uv / ${LAWN_TEXTURE_SCALE}).rgb;
         vec3 dirtColor = texture2D(uDirtTexture, uv / ${LAWN_TEXTURE_SCALE}).rgb;
         float n = 0.5 + 0.5 * simplex2d(uv / uNoiseScale);
         float s = smoothstep(uPatchiness - 0.1, uPatchiness + 0.1, n);
         diffuseColor *= vec4(mix(grassColor, dirtColor, s), 1.0);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `vec3 mapN = texture2D(normalMap, uv / ${LAWN_TEXTURE_SCALE}).xyz * 2.0 - 1.0;
         mapN.xy *= normalScale;
         normal = normalize(tbn * mapN);`,
      );
    };
    const ground = new Mesh(new PlaneGeometry(1_000, 1_000), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;

    const grassSource = firstMesh(grassGltf.scene);
    if (!grassSource) throw new Error('grass.glb 不包含 Mesh');
    const sourceMaterial = firstMaterial(grassSource);
    const grassMaterial = new MeshPhongMaterial({
      map: materialMap(sourceMaterial),
      emissive: 0x308040,
      emissiveIntensity: 0.05,
      alphaTest: 0.5,
      side: DoubleSide,
    }) as WindMaterial;
    grassMaterial.color.multiplyScalar(0.6);
    this.configureWindMaterial(grassMaterial, true);
    sourceMaterial?.dispose();
    const grass = this.createGrassInstances(
      grassSource.geometry,
      grassMaterial,
    );

    const flowers = new Group();
    const windMaterials: WindMaterial[] = [grassMaterial];
    for (const gltf of flowerGltfs) {
      const template = gltf.scene.children[0] ?? gltf.scene;
      template.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const previous = firstMaterial(object);
        const material = new MeshPhongMaterial({
          map: materialMap(previous),
          color:
            previous && 'color' in previous
              ? (previous.color as Color).clone()
              : 0xffffff,
          side: DoubleSide,
        }) as WindMaterial;
        this.configureWindMaterial(material, false);
        object.material = material;
        windMaterials.push(material);
        previous?.dispose();
      });
      flowers.add(this.createFlowerInstances(template));
    }
    const root = new Group();
    root.name = GROUND_NAME;
    root.userData.planeGeometry = 'lawn';
    root.userData.windMaterials = windMaterials;
    root.add(ground, grass, flowers);
    return root;
  }

  private configureWindMaterial(
    material: WindMaterial,
    instanced: boolean,
  ): void {
    material.customProgramCacheKey = () =>
      instanced ? 'lawn-grass-wind' : 'lawn-flower-wind';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: material.userData.windTime ?? 0 };
      shader.uniforms.uWindStrength = {
        value: new Vector3(0.3 * LAWN_SCALE_UNIT, 0, 0.3 * LAWN_SCALE_UNIT),
      };
      shader.uniforms.uWindFrequency = { value: 1 };
      shader.uniforms.uWindScale = { value: 400 * LAWN_SCALE_UNIT };
      shader.vertexShader =
        'uniform float uTime;\nuniform vec3 uWindStrength;\nuniform float uWindFrequency;\nuniform float uWindScale;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `${SIMPLEX_2D_GLSL}\nvoid main() {`,
      );
      const projection = instanced
        ? `vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
           float windOffset = 6.28 * simplex2d((modelMatrix * mvPosition).xz / uWindScale);
           vec3 windSway = position.y * uWindStrength * sin(uTime * uWindFrequency + windOffset) * cos(uTime * 1.4 * uWindFrequency + windOffset);
           mvPosition.xyz += windSway;
           mvPosition = modelViewMatrix * mvPosition;
           gl_Position = projectionMatrix * mvPosition;`
        : `vec4 mvPosition = vec4(transformed, 1.0);
           float windOffset = 6.28 * simplex2d((modelMatrix * mvPosition).xz / uWindScale);
           vec3 windSway = 0.2 * position.y * uWindStrength * sin(uTime * uWindFrequency + windOffset) * cos(uTime * 1.4 * uWindFrequency + windOffset);
           mvPosition.xyz += windSway;
           mvPosition = modelViewMatrix * mvPosition;
           gl_Position = projectionMatrix * mvPosition;`;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        projection,
      );
      material.userData.shader = shader;
    };
  }

  private createGrassInstances(
    geometry: BufferGeometry,
    material: WindMaterial,
  ): InstancedMesh {
    const instances = new InstancedMesh(geometry, material, 25_000);
    const transform = new Object3D();
    const color = new Color();
    let count = 0;
    for (let index = 0; index < 25_000; index += 1) {
      const radius = 2 + this.random() * 100;
      const angle = this.random() * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      if (
        0.5 + 0.5 * simplex2d(x / LAWN_NOISE_SCALE, z / LAWN_NOISE_SCALE) >
          LAWN_PATCHINESS &&
        this.random() + 0.6 > LAWN_PATCHINESS
      ) {
        continue;
      }
      transform.position.set(x, 0, z);
      transform.rotation.set(0, Math.PI * 2 * this.random(), 0);
      transform.scale.set(
        5 * LAWN_SCALE_UNIT + LAWN_SCALE_UNIT * this.random(),
        4 * LAWN_SCALE_UNIT + 2 * LAWN_SCALE_UNIT * this.random(),
        5 * LAWN_SCALE_UNIT + LAWN_SCALE_UNIT * this.random(),
      );
      transform.updateMatrix();
      color.setRGB(0.25 + this.random() * 0.1, 0.3 + this.random() * 0.3, 0.1);
      instances.setMatrixAt(count, transform.matrix);
      instances.setColorAt(count, color);
      count += 1;
    }
    instances.count = Math.min(5_000, count);
    instances.castShadow = true;
    instances.receiveShadow = true;
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
    return instances;
  }

  private createFlowerInstances(template: Object3D): Group {
    const group = new Group();
    for (let index = 0; index < 50; index += 1) {
      const radius = 2 + this.random() * 80;
      const angle = this.random() * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      if (
        0.5 + 0.5 * simplex2d(x / LAWN_NOISE_SCALE, z / LAWN_NOISE_SCALE) >
          LAWN_PATCHINESS &&
        this.random() + 0.8 > LAWN_PATCHINESS
      ) {
        continue;
      }
      const flower = template.clone(true);
      flower.position.set(x, 0, z);
      flower.rotation.set(0, Math.PI * 2 * this.random(), 0);
      const scale = (0.05 + 0.05 * this.random()) * LAWN_SCALE_UNIT;
      flower.scale.setScalar(scale);
      flower.traverse((object) => {
        if (object instanceof Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      group.add(flower);
    }
    return group;
  }

  private async createRock(asset: GroundAssetDefinition): Promise<Group> {
    const [rockMap, normalMap] = await this.loadTexturePair(asset);
    this.configureTexture(rockMap, true);
    this.configureTexture(normalMap, false);
    const groundMaterial = new MeshPhongMaterial({
      emissive: 0x2a242c,
      emissiveIntensity: 0.02,
      normalMap,
      normalScale: new Vector2(1.6, 1.6),
      shininess: 8,
      specular: 0x222222,
    }) as MeshPhongMaterial & { rockMap: Texture };
    groundMaterial.rockMap = rockMap;
    groundMaterial.customProgramCacheKey = () => 'rock-ground-flat';
    groundMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uRockTexture = { value: rockMap };
      shader.vertexShader =
        'varying vec3 vRockWorldPos;\n' + shader.vertexShader;
      shader.fragmentShader =
        'varying vec3 vRockWorldPos;\nuniform sampler2D uRockTexture;\n' +
        shader.fragmentShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRockWorldPos = worldPosition.xyz;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `vec2 uv = vec2(vRockWorldPos.x, vRockWorldPos.z);
         vec3 rockColor = texture2D(uRockTexture, uv / 4.2).rgb;
         vec3 rockDetail = texture2D(uRockTexture, uv / 1.6).rgb;
         diffuseColor *= vec4(mix(rockColor, rockDetail, 0.18), 1.0);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `vec3 mapN = texture2D(normalMap, uv / 4.2).xyz * 2.0 - 1.0;
         vec3 mapNDetail = texture2D(normalMap, uv / 1.6).xyz * 2.0 - 1.0;
         mapN = normalize(mix(mapN, mapNDetail, 0.3));
         mapN.xy *= normalScale;
         normal = normalize(tbn * mapN);`,
      );
    };
    const pebbleMaterial = new MeshPhongMaterial({
      color: 0xffffff,
      emissive: 0x1a1814,
      emissiveIntensity: 0.03,
      shininess: 12,
      specular: 0x333333,
      flatShading: true,
      map: rockMap,
    });
    const boulderMaterial = new MeshPhongMaterial({
      color: 0xffffff,
      emissive: 0x151310,
      emissiveIntensity: 0.025,
      shininess: 18,
      specular: 0x444444,
      flatShading: true,
      map: rockMap,
    });
    const plane = new Mesh(new PlaneGeometry(1_000, 1_000), groundMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    const pebbles = [
      this.deformedRock(0.22, 1),
      this.deformedRock(0.3, 1),
      new OctahedronGeometry(0.26, 0),
    ];
    const stones = [
      this.deformedRock(0.7, 2),
      this.deformedRock(0.9, 1),
      new OctahedronGeometry(0.8, 0),
      new DodecahedronGeometry(0.75, 0),
    ];
    const boulders = [
      this.deformedRock(2, 2),
      this.deformedRock(2.6, 2),
      new OctahedronGeometry(2.3, 1),
    ];
    const root = new Group();
    root.name = GROUND_NAME;
    root.userData.planeGeometry = 'rock';
    root.add(
      plane,
      this.createRockInstances(pebbles, pebbleMaterial, {
        count: 1_400,
        maxCount: 3_200,
        spreadMin: 3,
        spreadRange: 100,
        rockBias: 0.55,
        minScale: 0.55,
        maxScale: 1.3,
        ySink: 0.08,
        color: 0xc4b49a,
        colorVariance: 0.35,
      }),
      this.createRockInstances(stones, pebbleMaterial, {
        count: 180,
        maxCount: 420,
        spreadMin: 5,
        spreadRange: 95,
        rockBias: 0.5,
        minScale: 0.75,
        maxScale: 1.6,
        ySink: 0.22,
        color: 0xb69f88,
        colorVariance: 0.28,
      }),
      this.createRockInstances(boulders, boulderMaterial, {
        count: 32,
        maxCount: 70,
        spreadMin: 10,
        spreadRange: 95,
        rockBias: 0.43,
        minScale: 0.9,
        maxScale: 1.7,
        ySink: 0.7,
        color: 0x9e8b78,
        colorVariance: 0.22,
      }),
    );
    return root;
  }

  private deformedRock(radius: number, detail: number): IcosahedronGeometry {
    const geometry = new IcosahedronGeometry(radius, detail);
    const position = geometry.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      const deformation =
        0.82 +
        0.22 * simplex2d(x * 3.1 + 17, z * 3.1 - 9) +
        0.12 * simplex2d(y * 5, x * 4);
      position.setXYZ(
        index,
        x * deformation,
        y * deformation * 0.72,
        z * deformation,
      );
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  private createRockInstances(
    geometries: BufferGeometry[],
    material: MeshPhongMaterial,
    config: {
      count: number;
      maxCount: number;
      spreadMin: number;
      spreadRange: number;
      rockBias: number;
      minScale: number;
      maxScale: number;
      ySink: number;
      color: number;
      colorVariance: number;
    },
  ): Group {
    const root = new Group();
    const transform = new Object3D();
    const color = new Color();
    const baseColor = new Color(config.color);
    const capacity = Math.ceil(config.maxCount / geometries.length);
    for (const [geometryIndex, geometry] of geometries.entries()) {
      const instances = new InstancedMesh(geometry, material, capacity);
      let available = 0;
      for (let index = 0; index < capacity; index += 1) {
        const radius = config.spreadMin + this.random() * config.spreadRange;
        const angle = this.random() * Math.PI * 2;
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        const noise = 0.5 + 0.5 * fractalNoise(x / 22, z / 22);
        if (
          (noise > config.rockBias && this.random() > 0.22) ||
          (noise <= config.rockBias && this.random() > 0.85)
        ) {
          continue;
        }
        const scale =
          config.minScale + this.random() * (config.maxScale - config.minScale);
        transform.position.set(x, -config.ySink, z);
        transform.rotation.set(
          this.random() * 0.4,
          this.random() * Math.PI * 2,
          this.random() * 0.4,
        );
        transform.scale.set(
          scale * (0.85 + this.random() * 0.35),
          scale * (0.45 + this.random() * 0.35),
          scale * (0.85 + this.random() * 0.35),
        );
        transform.updateMatrix();
        color
          .copy(baseColor)
          .multiplyScalar(0.75 + this.random() * config.colorVariance);
        if (this.random() < 0.08) {
          color.offsetHSL(0.02 + this.random() * 0.04, 0.05, 0.05);
        }
        instances.setMatrixAt(available, transform.matrix);
        instances.setColorAt(available, color);
        available += 1;
      }
      const target = Math.ceil(
        (config.count / geometries.length) *
          (geometryIndex === 0 ? 1.15 : 0.95),
      );
      instances.count = Math.min(target, available);
      instances.castShadow = true;
      instances.receiveShadow = true;
      instances.instanceMatrix.needsUpdate = true;
      if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
      root.add(instances);
    }
    return root;
  }

  private async createStone(asset: GroundAssetDefinition): Promise<Group> {
    const [stoneMap, normalMap] = await this.loadTexturePair(asset);
    this.configureTexture(stoneMap, true);
    this.configureTexture(normalMap, false);
    const material = new MeshPhongMaterial({
      emissive: 0x2c281f,
      emissiveIntensity: 0.018,
      normalMap,
      normalScale: new Vector2(1.85, 1.85),
      shininess: 14,
      specular: 0x2a2a2a,
    }) as MeshPhongMaterial & { stoneMap: Texture };
    material.stoneMap = stoneMap;
    material.customProgramCacheKey = () => 'stone-ground-gravel';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uStoneTexture = { value: stoneMap };
      shader.vertexShader =
        'varying vec3 vStoneWorldPos;\n' + shader.vertexShader;
      shader.fragmentShader =
        'varying vec3 vStoneWorldPos;\nuniform sampler2D uStoneTexture;\n' +
        shader.fragmentShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvStoneWorldPos = worldPosition.xyz;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `${SIMPLEX_2D_GLSL}\nvoid main() {`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `vec2 uv = vec2(vStoneWorldPos.x, vStoneWorldPos.z);
         vec3 sandColor = texture2D(uStoneTexture, uv / 3.8).rgb;
         vec3 gritColor = texture2D(uStoneTexture, uv / 1.2).rgb;
         vec3 base = mix(sandColor, gritColor, 0.28);
         float ripple = 0.5 + 0.5 * simplex2d(uv / 14.0);
         base *= mix(vec3(0.97, 0.99, 1.03), vec3(1.05, 1.02, 0.96), ripple) * mix(0.96, 1.05, ripple);
         float spark = simplex2d(uv * 38.0 + 11.7);
         base += step(0.88, fract(spark * 13.37)) * 0.07;
         diffuseColor *= vec4(base, 1.0);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `vec3 mapN = texture2D(normalMap, uv / 3.8).xyz * 2.0 - 1.0;
         vec3 mapNDetail = texture2D(normalMap, uv / 1.2).xyz * 2.0 - 1.0;
         mapN = normalize(mix(mapN, mapNDetail, 0.4));
         mapN.xy *= normalScale;
         normal = normalize(tbn * mapN);`,
      );
    };
    const mesh = new Mesh(new PlaneGeometry(1_000, 1_000), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    const root = new Group();
    root.name = GROUND_NAME;
    root.userData.planeGeometry = 'stone';
    root.add(mesh);
    return root;
  }
}
