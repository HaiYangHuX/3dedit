import { z } from 'zod';

export const CHART_TYPES = [
  'pie',
  'line',
  'funnel',
  'stacked-line',
  'stacked-bar',
  'radar',
  'scatter',
  'gauge',
  'heatmap',
] as const;

export const chartTypeSchema = z.enum(CHART_TYPES);
export const chartOptionSchema = z.record(z.string(), z.json());
export const chartComponentSchema = z.object({
  kind: z.literal('chart'),
  chartType: chartTypeSchema,
  width: z.number().int().min(160).max(4_096),
  height: z.number().int().min(120).max(4_096),
  option: chartOptionSchema,
});

export type ChartType = z.infer<typeof chartTypeSchema>;
export type ChartComponent = z.infer<typeof chartComponentSchema>;

export interface ChartDefinition {
  name: string;
  option: ChartComponent['option'];
}

const week = [
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
  '星期日',
];

const heatmapValues = [
  [120, 80, 350, 680, 520, 450],
  [100, 90, 380, 720, 580, 480],
  [150, 120, 420, 750, 620, 520],
  [180, 150, 480, 820, 680, 580],
  [200, 180, 520, 880, 750, 650],
  [350, 280, 680, 950, 820, 780],
  [420, 350, 750, 1_000, 880, 850],
];

/** ECharts 配置必须保持纯 JSON，运行时任务和后端文档才能无损传输。 */
export const CHART_DEFINITIONS: Record<ChartType, ChartDefinition> = {
  pie: {
    name: '饼图',
    option: {
      title: {
        text: '今日访客',
        left: 'center',
        textStyle: { color: '#fff' },
      },
      tooltip: { trigger: 'item' },
      legend: {
        orient: 'vertical',
        left: 'left',
        textStyle: { color: '#fff' },
      },
      series: [
        {
          name: '今日访客',
          type: 'pie',
          radius: '50%',
          data: [
            { value: 1_048, name: '北京' },
            { value: 735, name: '上海' },
            { value: 580, name: '广州' },
            { value: 484, name: '深圳' },
            { value: 300, name: '成都' },
          ],
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    },
  },
  line: {
    name: '折线图',
    option: {
      textStyle: { color: '#fff' },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', boundaryGap: false, data: week },
      yAxis: { type: 'value' },
      series: [
        {
          name: '访问量',
          data: [820, 932, 901, 934, 1_290, 1_330, 1_320],
          type: 'line',
          areaStyle: {},
        },
      ],
    },
  },
  funnel: {
    name: '漏斗图',
    option: {
      title: {
        text: '数字孪生场景访问来源',
        textStyle: { color: '#fff' },
      },
      tooltip: { trigger: 'item', formatter: '{a} <br/>{b} : {c}%' },
      legend: {
        data: ['搜索引擎', '行业社区', '技术社区', '代码平台', '直接访问'],
        textStyle: { color: '#fff' },
      },
      series: [
        {
          name: '访问来源',
          type: 'funnel',
          left: '10%',
          top: 60,
          bottom: 60,
          width: '80%',
          min: 0,
          max: 100,
          minSize: '0%',
          maxSize: '100%',
          sort: 'descending',
          gap: 2,
          label: { show: true, position: 'inside' },
          itemStyle: { borderColor: '#fff', borderWidth: 1 },
          data: [
            { value: 20, name: '搜索引擎' },
            { value: 40, name: '行业社区' },
            { value: 60, name: '技术社区' },
            { value: 80, name: '代码平台' },
            { value: 100, name: '直接访问' },
          ],
        },
      ],
    },
  },
  'stacked-line': {
    name: '折线图堆叠',
    option: {
      title: {
        text: '设备访问数据',
        textStyle: { color: '#fff' },
      },
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['产线一', '产线二', '产线三', '仓储', '能源'],
        textStyle: { color: '#fff' },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: week,
        axisLabel: { color: '#fff' },
      },
      yAxis: { type: 'value', axisLabel: { color: '#fff' } },
      series: [
        {
          name: '产线一',
          type: 'line',
          stack: 'Total',
          data: [120, 132, 101, 134, 90, 230, 210],
        },
        {
          name: '产线二',
          type: 'line',
          stack: 'Total',
          data: [220, 182, 191, 234, 290, 330, 310],
        },
        {
          name: '产线三',
          type: 'line',
          stack: 'Total',
          data: [150, 232, 201, 154, 190, 330, 410],
        },
        {
          name: '仓储',
          type: 'line',
          stack: 'Total',
          data: [320, 332, 301, 334, 390, 330, 320],
        },
        {
          name: '能源',
          type: 'line',
          stack: 'Total',
          data: [820, 932, 901, 934, 1_290, 1_330, 1_320],
        },
      ],
    },
  },
  'stacked-bar': {
    name: '堆叠柱状图',
    option: {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { textStyle: { color: '#fff' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: [
        {
          type: 'category',
          data: [
            '一月',
            '二月',
            '三月',
            '四月',
            '五月',
            '六月',
            '七月',
            '八月',
            '九月',
            '十月',
            '十一月',
            '十二月',
          ],
          axisLabel: { color: '#fff' },
        },
      ],
      yAxis: [{ type: 'value', axisLabel: { color: '#fff' } }],
      series: [
        {
          name: '产量',
          type: 'bar',
          data: [320, 332, 301, 334, 390, 330, 320, 120, 430, 240, 150, 160],
        },
        {
          name: '合格',
          type: 'bar',
          stack: '结果',
          data: [120, 132, 101, 134, 90, 230, 210, 120, 230, 140, 150, 260],
        },
        {
          name: '返修',
          type: 'bar',
          stack: '结果',
          data: [22, 18, 19, 24, 29, 33, 31, 12, 13, 42, 15, 5],
        },
        {
          name: '待检',
          type: 'bar',
          stack: '结果',
          data: [15, 23, 20, 15, 19, 33, 41, 12, 13, 61, 15, 16],
        },
      ],
    },
  },
  radar: {
    name: '雷达图',
    option: {
      title: {
        text: '产品性能对比',
        left: 'center',
        textStyle: { color: '#fff' },
      },
      tooltip: { trigger: 'item' },
      legend: {
        data: ['产品A', '产品B', '产品C'],
        bottom: 10,
        textStyle: { color: '#fff' },
      },
      radar: {
        indicator: [
          { name: '性能', max: 100 },
          { name: '易用性', max: 100 },
          { name: '功能', max: 100 },
          { name: '稳定性', max: 100 },
          { name: '安全性', max: 100 },
          { name: '性价比', max: 100 },
        ],
        center: ['50%', '55%'],
        radius: '65%',
        axisName: { color: '#fff', fontSize: 14 },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.3)' } },
      },
      series: [
        {
          name: '产品性能对比',
          type: 'radar',
          data: [
            {
              value: [85, 90, 75, 88, 82, 80],
              name: '产品A',
              areaStyle: { color: 'rgba(124, 77, 255, 0.2)' },
            },
            {
              value: [75, 85, 90, 75, 88, 85],
              name: '产品B',
              areaStyle: { color: 'rgba(68, 138, 255, 0.2)' },
            },
            {
              value: [90, 75, 85, 90, 75, 90],
              name: '产品C',
              areaStyle: { color: 'rgba(233, 198, 17, 0.2)' },
            },
          ],
        },
      ],
    },
  },
  scatter: {
    name: '散点图',
    option: {
      title: {
        text: '设备温度振动关系',
        left: 'center',
        textStyle: { color: '#fff' },
      },
      tooltip: { trigger: 'item' },
      legend: {
        data: ['正常', '关注'],
        bottom: 10,
        textStyle: { color: '#fff' },
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: '温度 (℃)',
        nameTextStyle: { color: '#fff' },
        axisLabel: { color: '#fff' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
      },
      yAxis: {
        type: 'value',
        name: '振动 (mm/s)',
        nameTextStyle: { color: '#fff' },
        axisLabel: { color: '#fff' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
      },
      series: [
        {
          name: '正常',
          type: 'scatter',
          symbolSize: 14,
          data: [
            [35, 1.2],
            [42, 1.6],
            [48, 2.1],
            [53, 2.5],
            [57, 2.9],
            [61, 3.2],
          ],
          itemStyle: { color: '#448aff', opacity: 0.75 },
        },
        {
          name: '关注',
          type: 'scatter',
          symbolSize: 18,
          data: [
            [58, 4.1],
            [63, 4.8],
            [68, 5.6],
            [72, 6.2],
          ],
          itemStyle: { color: '#e9c611', opacity: 0.8 },
        },
      ],
    },
  },
  gauge: {
    name: '仪表盘',
    option: {
      title: {
        text: '项目完成度',
        left: 'center',
        top: '10%',
        textStyle: { color: '#fff', fontSize: 20 },
      },
      tooltip: { formatter: '{a} <br/>{b} : {c}%' },
      series: [
        {
          name: '完成度',
          type: 'gauge',
          center: ['50%', '60%'],
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          splitNumber: 10,
          radius: '80%',
          axisLine: {
            lineStyle: {
              width: 15,
              color: [
                [0.3, '#7c4dff'],
                [0.7, '#448aff'],
                [1, '#e9c611'],
              ],
            },
          },
          pointer: { itemStyle: { color: 'auto' }, width: 5 },
          detail: {
            valueAnimation: true,
            formatter: '{value}%',
            color: '#fff',
            fontSize: 30,
            offsetCenter: [0, '20%'],
          },
          data: [{ value: 75, name: '完成度' }],
          title: { offsetCenter: [0, '-10%'], fontSize: 16, color: '#fff' },
        },
      ],
    },
  },
  heatmap: {
    name: '热力图',
    option: {
      title: {
        text: '一周访问量热力图',
        left: 'center',
        textStyle: { color: '#fff' },
      },
      tooltip: { position: 'top' },
      grid: { height: '60%', top: '15%', left: '10%', right: '10%' },
      xAxis: {
        type: 'category',
        data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
        splitArea: { show: true },
        axisLabel: { color: '#fff' },
      },
      yAxis: {
        type: 'category',
        data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
        splitArea: { show: true },
        axisLabel: { color: '#fff' },
      },
      visualMap: {
        min: 0,
        max: 1_000,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
        inRange: {
          color: [
            '#1e3a8a',
            '#3b82f6',
            '#7c4dff',
            '#e9c611',
            '#f97316',
            '#ef4444',
          ],
        },
        textStyle: { color: '#fff' },
      },
      series: [
        {
          name: '访问量',
          type: 'heatmap',
          data: heatmapValues.flatMap((values, day) =>
            values.map((value, time) => [day, time, value]),
          ),
          label: { show: true, color: '#fff', fontSize: 12 },
        },
      ],
    },
  },
};

export function createDefaultChartComponent(
  chartType: ChartType,
): ChartComponent {
  return {
    kind: 'chart',
    chartType,
    width: 850,
    height: 500,
    option: structuredClone(CHART_DEFINITIONS[chartType].option),
  };
}
