import {
  CHART_DEFINITIONS,
  CHART_TYPES,
  type ChartType,
} from '@digital-twin/scene-schema';
import {
  Aim,
  DataAnalysis,
  DataLine,
  Grid,
  Histogram,
  Odometer,
  PieChart,
  TrendCharts,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';

export interface ChartPaletteDefinition {
  name: string;
  icon: Component;
}

const chartIcons: Record<ChartType, Component> = {
  pie: PieChart,
  line: DataLine,
  funnel: DataAnalysis,
  'stacked-line': TrendCharts,
  'stacked-bar': Histogram,
  radar: Aim,
  scatter: Grid,
  gauge: Odometer,
  heatmap: DataAnalysis,
};

/** 图表名称来自协议默认模板，图标只负责编辑器展示，不写入场景文档。 */
export const CHART_PALETTE_ITEMS = CHART_TYPES.map((chartType) => ({
  chartType,
  name: CHART_DEFINITIONS[chartType].name,
  icon: chartIcons[chartType],
}));

export function getChartDefinition(
  chartType: ChartType,
): ChartPaletteDefinition {
  return {
    name: CHART_DEFINITIONS[chartType].name,
    icon: chartIcons[chartType],
  };
}
