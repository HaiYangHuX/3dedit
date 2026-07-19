# cj.glb 模型导入尺寸与明暗保真设计

## 1. 目标

修复同一个 `cj.glb` 在 数字孪生 中能完整显示，而在本平台拖入后尺寸过大、只能看到局部且整体偏暗的问题。修复必须来自原站线上实现和参考仓库源码，不通过提高曝光、覆盖材质或增加猜测灯光掩盖根因。

本次验收模型为：

- 文件：`/Users/haiyang/Desktop/3Dchejian/cj.glb`
- 大小：`8,917,360` bytes
- SHA-256：`1cb5b82193391e7242a68b47a4f39f595aa1e4df40e118c0452f648d814812ff`
- 原始包围盒尺寸约：`232.61 × 7.41 × 59.02`

该文件与模型库资产 `cmrpsi0w70000zvmkakxhtgk5` 当前 source 文件哈希一致，因此不是上传了不同模型造成的视觉差异。

## 2. 原站与源码证据

### 2.1 数字孪生 4.0.4 在线构建

2026-07-18 对原站当前构建 `/edit/js/renderScene-OLdlmnPo.js` 只读检查后确认，拖入模型执行以下逻辑：

```js
model.traverse((mesh) => {
  if (mesh instanceof Mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
});
model.position.copy(dropPoint);
const size = new Box3().setFromObject(model).getSize(new Vector3());
const maxSize = Math.max(size.x, size.y, size.z);
const scale = 1.5 / (maxSize > 1 ? maxSize : 0.5);
model.scale.set(scale, scale, scale);
```

同一线上构建的新场景渲染基线为：

- `PerspectiveCamera(45, aspect, 0.05, 20000)`；
- Camera 初始位置 `0.607, 3.347, 7.966`，target 为 `0, 0.5, 0`；
- `NeutralToneMapping`，曝光 `1.2`；
- Venice HDR 环境，Y 轴旋转 `Math.PI / 2`；
- `FogExp2('#3b3b3b', 0.01)`；
- 新场景不自动注入 AmbientLight 或 DirectionalLight，业务灯光只在用户添加后存在。

因此不能通过新增默认灯光或切换 Reinhard/曝光 2 修复当前场景，这会偏离原站在线版本。

### 2.2 GitHub 参考仓库

参考仓库 `zhangbo126/threejs-3dmodel-edit`，commit `b5f613a4f6b5e384694e48c989fc7e142c0a36ef` 中也明确使用 Box3 做导入归一化：

- `src/utils/modelEditClass/materialModules.js`：主模型目标最大边 `2.5`；
- `src/utils/renderModel.js`：旧版多模型目标最大边 `1.2`。

参考仓库基于较早的模型编辑器流程，而线上 4.0.4 场景编辑器已经将多模型目标值调整为 `1.5`。本项目以线上实际版本为最终基准，参考仓库用于证明“模型导入时必须先归一化”这一核心逻辑。

## 3. 根因

当前 `AssetLoader` 保留 GLB 原始根变换，`AssetInstanceSystem` 克隆后直接交给 SceneNode。`cj.glb` 的最大边因此仍为 `232.61`，而新场景 Camera 距离只有约 `8.46`，模型必然超出视锥。

为了看全模型，现有测试场景 Camera 已被拉远到约 `90` 个单位。此时 `FogExp2(0.01)` 的可见透射比例约为：

```text
exp(-(0.01 × 90)²) ≈ 0.445
```

大量表面颜色会与 `#3b3b3b` 雾色混合，所以“尺寸特别大”和“场景偏暗”是同一导入尺度缺失造成的两个症状。HDR、Neutral 1.2 和 GLTF 原材质并不是本次根因。

## 4. 设计

### 4.1 模型内部归一化

新增独立 `createNormalizedModelInstance(content)`：

1. 克隆模板后用 `Box3.setFromObject` 计算最大边；
2. 严格使用线上公式 `1.5 / (maxSize > 1 ? maxSize : 0.5)`；
3. 所有 Mesh 默认 `castShadow=true`、`receiveShadow=true`；
4. 不居中、不自动落地、不修改材质，避免引入线上代码不存在的行为；
5. 空包围盒或非法尺寸必须退化到有限缩放，不能产生 `Infinity/NaN`。

### 4.2 业务变换隔离

线上源码把归一比例直接写到模型根。本平台的 SceneNode transform 是持久化业务协议，若照搬到同一根，TransformControls 会把约 `0.00645` 的导入补偿误写成用户缩放。

因此实例结构为：

```text
SceneNode business root  scale = [1, 1, 1]
└── normalized content   scale = source normalization scale
    └── cloned GLTF scene
```

该包装只隔离协议层与资源层，不改变最终世界矩阵效果。模型结构平铺、射线选择、材质遍历、动画查找和 Editor/Runtime 共用的 `AssetInstanceSystem` 都继续从业务根递归工作。

### 4.3 明确不修改的内容

- 不修改 GLTF `color`、`metalness`、`roughness` 或贴图；
- 不新增默认 AmbientLight/DirectionalLight；
- 不改变 Neutral、曝光 1.2、Venice HDR、FogExp2 0.01；
- 不自动迁移用户已保存的 Camera；旧场景可使用现有“重置场景相机位置”恢复源站默认视角；
- 不复制另一个不同哈希的 `public/models/cj.glb` 作为验收文件。

## 5. 测试与验收

- 单元测试使用 `cj.glb` 实际尺寸回归，断言最大边为 `1.5`；
- 断言业务根 scale 仍为 `[1,1,1]`，内部 content 保存归一比例；
- 断言小模型继续使用源站 `0.5` 分母；
- 断言空包围盒缩放始终为有限数；
- 断言共享模板只加载一次、实例独立但 GPU 几何仍共享；
- Three Engine 全量测试、类型检查、全项目构建必须通过；
- 用用户提供的真实 `cj.glb` 创建临时隔离场景，Editor 和 Runtime 都必须加载 1 个业务对象、149 个可见 Mesh；
- 默认视角下模型完整出现，不再只显示 232 单位模型的局部；靠近观察时墙体、地板和设备不再受到远距离 FogExp2 的大比例压暗；
- 验收后删除临时项目，不修改用户真实场景内容。
