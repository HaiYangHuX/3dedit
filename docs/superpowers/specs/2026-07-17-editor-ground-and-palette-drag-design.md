# 编辑器地面环境与资源拖放设计

## 1. 目标

修复编辑器默认画面过黑、网格缺乏地面纵深，以及几何体和灯光只能点击添加、不能拖入视口的问题。实现应对照 ThreeFlowX 线上 r183 行为，但继续遵守当前项目的强类型 SceneDocument、命令历史和 Three.js 资源所有权边界。

## 2. 参考实现结论

### 2.1 ThreeFlowX 线上 r183

对 `http://threeflowx.cn/edit/#/` 当前构建产物只读检查后确认：

- 渲染器使用 Neutral tone mapping，默认曝光为 `1.2`。
- 场景默认背景为 `#3b3b3b`，使用同色 `FogExp2`，密度为 `0.01`。
- 默认加载 HDR 作为 `scene.environment`，因此没有业务灯光时 PBR 模型仍然可辨认。
- “地板感”默认来自同一水平面的两层 `GridHelper`：大小均为 `200`；细网格 `2000` 分段、透明度 `0.1`、颜色 `0xaaaaaa`；主网格 `200` 分段、透明度 `0.3`、颜色 `0xffffff`。
- 所有模型、几何体和灯光素材条目都设置 `draggable=true`。dragstart 保存完整 `modelData/modelType`，视口 drop 记录 `clientX/clientY`，通过相对画布 NDC 射线与 `y=0` 平面求交，再按 `modelType` 分派到 `loadGeometry`、`loadLight` 或 `loadModel`。
- 射线没有交点时使用相机前方向量回退；普通落点的 Y 至少为 `0.5`，防止新几何体中心埋入网格。

线上证据来自 2026-07-17 的构建文件：

- `/edit/js/renderScene-OLdlmnPo.js`
- `/edit/js/index-DoPSF-m_.js`

### 2.2 GitHub 开源项目

`zhangbo126/threejs-3dmodel-edit` 的 `b5f613a` 源码采用较早实现：

- `src/utils/renderModel.js` 使用全景纹理同时作为背景和 environment。
- 创建环境光、可选平行光和 `ShadowMaterial` 平面接收阴影。
- `src/components/ModelChoose/index.vue` 的模型与几何体条目直接启用原生拖放。
- `src/views/modelEdit/index.vue` 在容器 `drop` 中按当前拖拽类型分派。
- `setGeometryModel` 和 `onLoadManyModel` 都使用相对容器坐标射线命中场景表面。

## 3. 当前根因

1. `SceneSettingsSystem` 只有一层 `100 x 100` 深蓝网格，线色与 `#111827` 默认背景过于接近。
2. 没有 HDR 时 `scene.environment` 为 `null`；编辑器仅有强度 `0.8` 的 AmbientLight，PBR 和模型原始材质缺乏方向、反射和层次。
3. 新建文档背景仍为 `#111827`、曝光为 `1`，与参考默认环境不同。
4. `AssetLibraryPanel` 只有模型卡写入拖放 MIME。
5. 几何体和灯光面板按钮没有 `draggable` 和 `dragstart`。
6. `EditorCanvas` 只识别模型资源 payload，并且只发出 `asset-drop`。

## 4. 设计决策

### 4.1 编辑器视觉环境

- 新建文档默认背景改为 `#3b3b3b`，曝光改为 `1.2`。
- 编辑器使用两层 `GridHelper` 复现线上密度和透明度；运行时继续不创建任何编辑器网格。
- 编辑器在没有用户 HDR 时使用 Three.js r183 `RoomEnvironment + PMREMGenerator` 生成进程内默认 IBL，不下载外部资源，也不把该纹理写入 SceneDocument。
- 当用户配置 HDR 时使用用户环境；清除 HDR 时恢复默认 IBL，而不是回到全黑。
- 编辑器网格使用与背景同色的 `FogExp2(0.01)` 做远端融合；该雾仅属于编辑辅助环境，不进入发布运行时。
- 默认 IBL、PMREM target、两层网格和材质都由现有 Engine/SettingsSystem 对称释放。

不采用实体地板 Mesh 作为默认方案，因为线上默认“网格”模式没有实体平面；额外 Mesh 会改变射线、阴影、选择过滤和发布所见内容。

### 4.2 统一拖放协议

新增编辑器内部判别联合：

```ts
type ScenePaletteDragPayload =
  | { kind: 'asset'; assetId: string; name: string; format: ModelAssetFormat }
  | { kind: 'geometry'; primitive: GeometryPrimitive }
  | { kind: 'light'; lightType: SceneLightType };
```

- 所有左侧可添加条目用同一自定义 MIME 写入 JSON payload。
- `EditorCanvas` 只负责校验 payload、用现有 `ViewportDropSystem` 计算世界坐标，并发出 `scene-drop` DTO；不直接写 Pinia 或 SceneDocument。
- `EditorWorkspace` 按 `kind` 分派到 `addAssetNode`、`addGeometry` 或 `addLight`，所以拖放与点击继续共享同一命令历史、自动保存和 Three 增量桥接。
- 几何体 drop 的中心 Y 最低为 `0.5`；灯光最低为 `0.5`；模型保持现有 `y=0` 落地语义。
- 点击添加继续保留，拖放只是增加精确位置入口。

不照搬原网站把当前拖拽对象保存在全局 Store 的方式，因为 HTML5 DataTransfer 判别联合可以避免跨组件残留状态和错误类型串用。

## 5. 验收

- 新建空场景在 1280×720 下显示灰色背景、清晰双层网格和远端融合，不再是近黑画面。
- 无业务灯光时 Standard/Physical 和模型原材质仍有可辨认的明暗与反射层次。
- 网格关闭时两层网格同时隐藏；运行时不出现编辑网格或默认编辑 IBL。
- 模型、立方体、球体、平面、圆柱体和五种灯光均可拖到视口。
- drop 坐标相对 WebGL canvas 计算，不受左右面板宽度影响。
- 拖放新增进入撤销/重做、保存和刷新还原闭环。
- 网格、PMREM 和默认环境没有重复创建或 GPU 资源泄漏。

