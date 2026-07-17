# 项目渲染配置与源站一致性设计

## 1. 目标

将 ThreeFlowX 当前 Three.js r183“项目配置”完整迁移到数字孪生场景平台，包括全部枚举、条件字段、输入范围、实际新场景默认值、内置地面资源、雨雪资源，以及编辑器和发布运行时一致的 Three.js 行为。

本轮不是只复制面板外观。所有配置必须进入强类型 SceneDocument、命令历史、自动保存、发布包和 RuntimeThreeEngine；切换配置后应立即改变真实 WebGL 场景。

## 2. 源站证据

基准来自 2026-07-17 的线上 r183 构建：

- `/edit/js/renderScene-OLdlmnPo.js`
- `/edit/js/index-DoPSF-m_.js`
- `/edit/js/three-vendor-ChHE0GLI.js`

源站 `initRender`、`initScene` 和 `initPlaneGround` 的实际默认值优先于 Vue 表单建立时的临时占位值。

### 2.1 渲染器

| 字段 | 选项 | 新场景默认值 |
| --- | --- | --- |
| 色调映射 | Custom、No、Linear、Reinhard、Cineon、ACESFilmic、AgX、Neutral | Neutral |
| 阴影类型 | NoShadow（实际映射 r183 BasicShadowMap）、PCF、PCFSoft、VSM | PCF |
| 曝光度 | `0–5`，步长 `0.1` | `1.2` |

源站始终启用 `renderer.shadowMap.enabled`，所谓 NoShadow 实际传入 `BasicShadowMap`，本项目保持这一真实行为而不根据标签猜测。

### 2.2 场景

| 字段 | 选项/范围 | 新场景默认值 |
| --- | --- | --- |
| 背景 | 无背景、颜色、图片 | 颜色 |
| 背景色 | CSS 颜色 | `#3b3b3b` |
| 背景图片 | JPG、PNG、HDR 资源 | `null` |
| 背景模糊度 | `0–1`，步长 `0.1` | `0` |
| 背景强度 | `0–6`，步长 `0.1` | `5` |
| 环境 | 无、Environment | Environment |
| 环境资源 | JPG、PNG、HDR；空资源表示内置 Venice HDR | 内置 Venice HDR |
| 环境旋转 | 固定 Y 轴 90° | `Math.PI / 2` |
| 雾 | 无、Fog、FogExp2 | FogExp2 |
| 雾色 | CSS 颜色 | `#3b3b3b` |
| Fog near/far | `0–1000`，步长 `2` | `1 / 200` |
| FogExp2 density | `0–5`，步长 `0.01`、三位小数 | `0.01` |

“无背景”按源站设置为 `#a0a0a0` 清屏色，而不是透明 Canvas。图片和环境上传继续进入本项目自己的素材库，SceneDocument 只保存资源 ID，不保存 Blob URL 或远程源站 URL。

### 2.3 地面

新场景默认是“网格”。用户截图中的“地板”是切换后的当前值，不是源站 `initPlaneGround` 默认值。

完整选项：

1. 无：不创建地面。
2. 网格：大小 `200` 的 2000/200 分段双层 GridHelper，透明度 `0.1/0.3`，颜色 `#aaaaaa/#ffffff`。
3. 草坪：颜色、泥土、法线纹理混合，并使用源站草叶/三色花 GLB 生成风摆实例。
4. 岩石：程序化多尺度地表纹理，并按源站分布生成 pebble、stone、boulder 实例。
5. 砂石：多尺度砂石纹理、程序化涟漪和矿物微闪。
6. 地板、地砖（1）、地砖（2）、板砖：`1500 × 1500` MeshStandard 地面，颜色/法线贴图，`roughness=0.8`、`metalness=0.2`、双面、接收阴影。

地面只属于场景设置辅助根，不进入业务节点树、射线选择或节点统计，但必须进入发布运行时。

### 2.4 天气

| 字段 | 范围 | 新场景默认值 |
| --- | --- | --- |
| 类型 | 无、雨、雪 | 无 |
| 数量 | `0–100000`，步长 `10` | `2000` |
| 速度 | `0.1–1.5`，步长 `0.1` | `0.4` |
| 透明度 | `0–1`，步长 `0.1` | `0.6` |
| 大小 | `0.1–2`，步长 `0.1` | `0.5` |
| 范围 | `0–500`，步长 `10` | `100` |
| 高度 | `0–300`，步长 `5` | `50` |

雨雪由一个 Points 系统管理。雨具有固定斜向漂移，雪具有双正弦横向摆动；粒子在顶部和地面附近渐隐。更新并入 Engine 的唯一 RAF，不额外创建第二条 requestAnimationFrame 链。

## 3. SceneDocument 字段

在现有 settings 上扩展以下扁平字段，继续保留 `background`、`environmentAssetId`、`exposure` 和 `gridVisible`，避免破坏当前已有场景：

```ts
interface SceneSettings {
  toneMapping: 'custom' | 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces-filmic' | 'agx' | 'neutral';
  shadowMapType: 'basic' | 'pcf' | 'pcf-soft' | 'vsm';
  exposure: number;
  backgroundType: 'none' | 'color' | 'texture';
  background: string;
  backgroundAssetId: string | null;
  backgroundBlurriness: number;
  backgroundIntensity: number;
  environmentEnabled: boolean;
  environmentAssetId: string | null;
  fogType: 'none' | 'linear' | 'exponential';
  fogColor: string;
  fogNear: number;
  fogFar: number;
  fogDensity: number;
  groundType: 'none' | 'grid' | 'lawn' | 'rock' | 'stone' | 'floor' | 'tile-1' | 'tile-2' | 'brick';
  gridVisible: boolean;
  weatherType: 'none' | 'rain' | 'snow';
  weatherCount: number;
  weatherSpeed: number;
  weatherOpacity: number;
  weatherSize: number;
  weatherArea: number;
  weatherHeight: number;
}
```

Zod 为新增字段提供上述源站默认值，使现存 schemaVersion 1 文档解析时自动补齐。本轮不新增文档版本。

`backgroundAssetId` 和 `environmentAssetId` 都进入服务端重建的 assetReferences；内置环境、地面和天气资源不占用用户素材 ID。

## 4. 模块边界

### 4.1 SceneSettingsSystem

负责 renderer tone mapping、shadow map、exposure、background、environment 和 fog。背景和环境分别维护异步代次：新资源成功前保留旧资源，路由切换或销毁后的迟到 Texture/PMREM 必须立即释放。

默认 Venice HDR 由 EditorEngine 和 RuntimeThreeEngine 共同初始化并作为 fallback。`environmentEnabled=false` 时必须明确置空环境，而不是恢复 fallback。

### 4.2 GroundSystem

只负责一个当前地面根。每次类型切换先建立新地面，成功后再替换旧地面；迟到结果释放。公开 `apply(type)`、`update(elapsed)`、`dispose()`。纹理、材质、实例几何和 GLTF 克隆的所有权在模块内闭合。

### 4.3 WeatherSystem

只负责当前 Points、粒子数组和更新。公开 `apply(settings)`、`update(delta, elapsed)`、`dispose()`。配置变化可重建粒子，`none` 必须立即清空。

### 4.4 Engine

EditorEngine 与 RuntimeThreeEngine 使用相同三个设置系统。编辑器额外保留黄色 BoxHelper；运行时额外保留交互 Outline。两者都继续通过 Composer 唯一写 Canvas。

## 5. 内置资源

资源放在 `packages/three-engine/src/settings/assets/`，由 Vite 的 `new URL(..., import.meta.url)` 同时打包到 editor-web 和 runtime-web，不依赖 ThreeFlowX 在线服务。

资源清单：

- Venice HDR 及本地预览图。
- `textures-1..7` 颜色图和 `textures-normal-1..7` 法线图。
- lawn dirt color。
- rain、snowflake 精灵图。
- grass、flower_white、flower_blue、flower_yellow GLB。

`ASSET-SOURCES.md` 记录源站 URL、原文件名、尺寸和 SHA-256。自动化测试固定哈希，防止未来误替换视觉基准。

## 6. 项目配置 UI

右侧“项目配置”按源站四个分组呈现：渲染器、场景、地面、天气。标题使用青色左边线，控件使用 Element Plus 的 Select、Slider/InputNumber、ColorPicker 和图片上传缩略图。

- 条件字段严格跟随源站：只有图片背景显示模糊度/强度；只有 Fog 显示 near/far；只有 FogExp2 显示 density；只有雨雪显示六个天气参数。
- 背景和环境缩略图点击选择文件，文件通过现有 multipart/worker 流程进入自己的素材库，完成后才写资源 ID。
- 内置环境没有用户资源 ID 时显示 Venice 预览；“无环境”不显示缩略图。
- 每次控件 commit 仍执行 UpdateSceneSettingsCommand，因此撤销、重做和自动保存保持一致。
- 视口网格按钮映射 `groundType=grid/none`；在项目配置中选择其他地面后按钮显示非激活。

## 7. 验收

- 新场景所有字段与源站实际初始化默认值一致。
- 九种地面和三种天气都能在编辑器切换、保存、刷新、预览和发布后还原。
- Tone mapping、shadow map、exposure、background、environment 和 fog 变化立即反映到 WebGL。
- 自定义背景/环境上传进入自己的素材库，发布 manifest 包含引用，删除保护生效。
- 编辑器与发布运行时视觉配置一致；运行时不出现编辑网格以外的编辑器辅助对象。
- 同一 DEVICE 模型在 Neutral、PCF、1.2、Venice、FogExp2 0.01 下作为视觉基准；切换“地板”后真实贴图和法线可见。
- 配置快速切换和组件卸载没有迟到纹理覆盖、额外 RAF 或 GPU 资源泄漏。
