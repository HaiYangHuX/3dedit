<script setup lang="ts">
import type { AssetDetail } from '@digital-twin/api-contracts';
import { AssetLoader } from '@digital-twin/three-engine';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Sphere,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ asset: AssetDetail | null }>();
const host = ref<HTMLDivElement>();
const loading = ref(false);
const error = ref('');
const showGrid = ref(true);

let scene: Scene | undefined;
let camera: PerspectiveCamera | undefined;
let renderer: WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let grid: GridHelper | undefined;
let model: Object3D | undefined;
let loader: AssetLoader | undefined;
let frame = 0;
let resizeObserver: ResizeObserver | undefined;

const canPreview = computed(
  () => props.asset?.kind === 'model' && props.asset.status === 'ready',
);

function resetView(): void {
  if (!model || !camera || !controls) return;
  const box = new Box3().setFromObject(model);
  if (box.isEmpty()) return;
  const center = box.getCenter(new Vector3());
  const sphere = box.getBoundingSphere(new Sphere());
  const radius = Math.max(sphere.radius, 0.1);
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.25;
  camera.position.set(
    center.x + distance * 0.8,
    center.y + distance * 0.55,
    center.z + distance,
  );
  camera.near = Math.max(radius / 1000, 0.001);
  camera.far = Math.max(radius * 100, 1000);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance = radius * 0.05;
  controls.maxDistance = radius * 30;
  controls.update();
}

function disposeObject(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Object3D & {
      geometry?: { dispose: () => void };
      material?: unknown;
    };
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const material of materials) {
      if (!material || typeof material !== 'object') continue;
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value) {
          (value as { dispose?: () => void }).dispose?.();
        }
      }
      (material as { dispose?: () => void }).dispose?.();
    }
  });
}

function clearModel(): void {
  if (model && scene) {
    scene.remove(model);
    disposeObject(model);
  }
  model = undefined;
}

async function loadModel(): Promise<void> {
  clearModel();
  error.value = '';
  if (!canPreview.value || !props.asset) return;
  const assetId = props.asset.id;
  const source = props.asset.files.find(
    (file) =>
      file.role === 'source' && file.checksum === props.asset?.sourceHash,
  );
  if (!source?.downloadUrl) {
    error.value = '当前版本没有可下载的源文件';
    return;
  }
  loading.value = true;
  try {
    loader ??= new AssetLoader({ dracoDecoderPath: '/decoders/draco/' });
    const loaded = await loader.load({
      assetId,
      name: props.asset.name,
      format: props.asset.format as
        'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'usdz',
      url: source.downloadUrl,
    });
    // 异步请求返回后详情抽屉可能已经切换到另一条资源，不能把旧模型挂回画布。
    if (props.asset?.id !== assetId) {
      disposeObject(loaded.root);
      return;
    }
    model = loaded.root;
    scene?.add(model);
    resetView();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '模型预览加载失败';
  } finally {
    loading.value = false;
  }
}

function resize(): void {
  if (!host.value || !camera || !renderer) return;
  const width = Math.max(host.value.clientWidth, 1);
  const height = Math.max(host.value.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
}

function animate(): void {
  if (!renderer || !scene || !camera) return;
  controls?.update();
  renderer.render(scene, camera);
  frame = requestAnimationFrame(animate);
}

function toggleGrid(): void {
  if (grid) grid.visible = showGrid.value;
}

onMounted(() => {
  if (!host.value) return;
  scene = new Scene();
  scene.background = new Color('#101827');
  camera = new PerspectiveCamera(42, 1, 0.01, 10_000);
  camera.position.set(4, 3, 5);
  renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping; // 提升 PBR 金属材质的高光层次。
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  host.value.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.target.set(0, 1, 0);
  scene.add(new HemisphereLight('#dbeafe', '#172033', 1.3));
  scene.add(new AmbientLight('#ffffff', 0.35));
  const key = new DirectionalLight('#ffffff', 2.2);
  key.position.set(5, 8, 6);
  key.castShadow = true;
  scene.add(key);
  const fill = new DirectionalLight('#60a5fa', 0.7);
  fill.position.set(-5, 3, -4);
  scene.add(fill);
  grid = new GridHelper(20, 20, '#334155', '#1e293b');
  grid.position.y = -0.01;
  scene.add(grid);
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host.value);
  resize();
  animate();
  void loadModel();
});

watch(
  () => props.asset?.id,
  () => void loadModel(),
);
watch(showGrid, toggleGrid);

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
  controls?.dispose();
  clearModel();
  loader?.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
  scene = undefined;
  camera = undefined;
  renderer = undefined;
  controls = undefined;
  loader = undefined;
});
</script>

<template>
  <div class="asset-preview-canvas">
    <div ref="host" class="asset-preview-canvas__host" />
    <div v-if="!canPreview" class="asset-preview-canvas__empty">
      该资源类型暂不支持 3D 预览
    </div>
    <div v-if="loading" class="asset-preview-canvas__loading">
      正在加载模型…
    </div>
    <div v-if="error" class="asset-preview-canvas__error">{{ error }}</div>
    <div class="asset-preview-canvas__toolbar">
      <button type="button" title="重置视角" @click="resetView">
        重置视角
      </button>
      <button
        type="button"
        :class="{ active: showGrid }"
        title="切换网格"
        @click="showGrid = !showGrid"
      >
        网格
      </button>
    </div>
  </div>
</template>
