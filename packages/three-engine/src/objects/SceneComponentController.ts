import type { Object3D } from 'three';
import { releaseChartObjectController } from '../charts/ChartObjectController.js';
import { releaseTextObjectController } from '../text/TextObjectController.js';

/** 释放 Three 通用遍历无法识别的 DOM/ECharts 控制器资源。 */
export function disposeSceneComponentObject(root: Object3D): boolean {
  const chartReleased = releaseChartObjectController(root);
  const textReleased = releaseTextObjectController(root);
  return chartReleased || textReleased;
}
