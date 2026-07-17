# 视口鼠标控制与源站一致性设计

## 目标

让编辑器和发布运行时的轨道相机行为贴近 ThreeFlowX 原项目，重点修复左键拖动、滚轮缩放的惯性、操作范围和观察中心差异。Three.js 继续锁定 `0.183.0`，不引入第二套相机控制器。

## 源码依据

原项目 `src/utils/renderModel.js` 与 `src/utils/initThreeTemplate.jsx` 均使用 `OrbitControls`：

- `enableDamping = true`，使用默认 `dampingFactor = 0.05`。
- 核心编辑器 `renderModel.js` 与预览运行时都关闭 `enablePan`；源码中另一个标签预览模板的 Pan 配置不属于模型编辑主路径。
- `controls.target` 初始化为 `(0, 0, 0)`。
- 模型加载后设置 `maxDistance = size.length() * 10`，避免滚轮无限拉远。
- 编辑器重置相机使用 `(0, 2, 6)` 看向原点。

当前项目编辑器未开启阻尼、观察中心为 `(0, 0.5, 0)` 且没有按场景包围盒设置最大距离；运行时沿用了 OrbitControls 默认的 Pan 开启状态。

## 设计

新增一个 Three 引擎内部的 OrbitControls 配置工具，统一设置阻尼、Pan 和原点观察中心，并根据业务场景根节点的世界包围盒更新 `maxDistance`。没有可渲染业务对象时保留相机当前距离和远裁剪面作为安全兜底，防止空场景初始化时突然跳变。

EditorEngine 在初始化、加载/添加/删除/更新节点后刷新距离上限；RuntimeThreeEngine 在文档加载完成后刷新一次。两者仍各自只拥有一条 RAF，TransformControls 拖拽期间继续暂时禁用 OrbitControls。

## 验收

- 编辑器左键旋转、右键平移和滚轮缩放具有阻尼惯性，且目标点为原点。
- 编辑器和运行时均不可平移，只允许源站主路径的旋转与滚轮缩放。
- 加载不同尺寸、多模型场景后，最大滚轮距离随包围盒变化，空场景不改变当前视距。
- 变换、选择、相机视图按钮和截图流程不回归。
- `pnpm verify` 全部通过。
