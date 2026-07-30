# 场景着色器源码对齐设计

## 目标

以 `threeflowx.cn/edit` 当前生产版本和 `zhangbo126/threejs-3dmodel-edit` 源码为唯一行为基线，在 Vue 3 编辑器、预览页和发布运行时中完整实现原站 Shader 模块。这里的“1:1”包括素材名称、方法标识、几何尺寸、初始方向、材质参数、GLSL、动画步进、选择变换、拖放、撤销、显式保存和重载恢复。

## 取证基线

- Three.js 固定使用仓库当前 `three@0.183.0`，与原站页面显示的 revision 183 一致。
- 线上素材面板展示 12 项：警告标记、扫描雷达、流动墙体、收缩光环、异常点闪烁、警告光圈、电子围栏、警告护栏、红色呼吸护栏、物流传送带、全息能量光柱、六边形科技底座。
- 源码方法枚举还包含 `CreateCompassShader`。协议和引擎支持全部 13 项，但不额外显示原站没有显示的罗盘卡片。
- 线上 UI 不编辑 uniforms。节点属性仍只暴露名称、显示/锁定、位置、旋转、缩放和业务数据。
- 生产包中的完整 vertex/fragment GLSL、uniform 默认值、`DoubleSide`、透明度、深度写入、混合模式和 `renderOrder` 原样迁移。

## 文档协议

新增强类型 `ShaderMethod` 和 `shaderComponentSchema`：

```ts
interface ShaderComponent {
  kind: 'shader';
  shaderMethod: ShaderMethod;
}
```

场景只持久化方法标识，不保存 Three.js 对象、材质实例或运行时 uniform。加载文档时由引擎确定性重建，避免编辑器、预览和发布端产生不同实现。

## 引擎结构

- `createShaderObject.ts`：保存从生产包还原的 13 个 Mesh 工厂和圆角围栏 BufferGeometry 生成器。每个调用都返回独占 geometry/material，交由现有场景资源生命周期释放。
- `ShaderSystem.ts`：缓存当前文档中的 Shader Mesh，执行原站三类动画更新，并在节点新增、替换、删除和文档切换后同步引用。
- `SceneDocumentSystem`：把 Shader 识别为可渲染主组件，创建、选择、统计和销毁方式与几何体一致；`shaderMethod` 改变时替换对象。
- `EditorEngine`：在现有唯一 RAF 中更新 Shader。有 Shader 时持续置脏并渲染，不创建第二个动画循环。
- `RuntimeThreeEngine`：在现有唯一 RAF 和 Composer 渲染前更新同一 ShaderSystem，保证预览与发布一致。

原站动画规则原样保留：`uTime` 每帧写入全局 elapsed time；雷达和罗盘的 `iTime` 每帧增加 `0.01`；警告光圈的 Y 缩放每帧增加或减少 `0.03`，范围固定在 `0.2` 到 `1.4`。

## 编辑器交互

- Shader 分类使用 Element Plus 图标和 tooltip，卡片文案与原站一致。
- 每张卡片支持单击在原点添加，也支持通过现有自定义 MIME 拖入画布。
- 拖放使用画布射线计算的世界坐标。水平平面和底部已对齐的柱体/围栏使用落点 Y，不套用几何体/灯光统一抬高 `0.5` 的规则。
- 新增节点通过现有 `AddNodeCommand`，因此立即选中、可变换、可删除、可复制、可撤销，但只有点击“保存”才写入后端。
- 场景树以普通一级节点展示 Shader，并提供与其他节点相同的操作。属性面板显示只读的着色器名称，不暴露原站没有的 uniform 编辑。

## 生命周期与错误边界

- ShaderSystem 只缓存引用，不销毁 GPU 资源；`SceneDocumentSystem` 继续通过 `disposeObject3D` 统一释放 geometry/material。
- 每次同步都会剔除已从文档根移除的对象，避免更新已释放材质。
- 未知 `shaderMethod` 在 Zod 文档边界直接拒绝，不允许进入 Three 工厂。
- 不新增纹理或网络资源，全部效果由原站 GLSL 生成。

## 验收

- Schema 对 13 项方法全部通过，对未知方法失败。
- 13 个工厂的 geometry、rotation、renderOrder、uniform、material flags 和 additive blending 与生产包一致。
- ShaderSystem 的三类更新、同步清理和文档生命周期有单元测试。
- 素材面板 12 项的点击、拖放、撤销、保存后重载均可用。
- 编辑器、`/preview/:sceneId` 和正式发布页面渲染同一文档时效果一致。
- 浏览器控制台无 WebGL shader compile/link error，Canvas 像素检查确认每项效果非空且连续动画。
