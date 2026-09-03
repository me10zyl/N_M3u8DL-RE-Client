# 去广告 Index 序列与自动检测设计

## 背景

当前客户端支持片段个数阈值去广告和 duration 序列去广告，并已有去广告调试弹窗。实际 HLS 内容中，单个 duration 可能在正片中大量重复，不能单独作为广告判断依据。本阶段增加 Index 序列规则和基于 discontinuity、片段数量、时长、TS 实际码率及可选 duration 序列的自动检测能力。

本阶段只实现去广告核心与调试功能，不实现 CMS 详情页每集按钮，也不实现加入队列后的广告截图弹窗。

## 目标

1. 在下载设置中增加去广告 Index 序列配置。
2. 下载时支持 Index 列表、范围和混合序列匹配。
3. Index 规则与现有 duration 规则及片段阈值规则同时生效，最终文件名集合去重。
4. 在现有去广告调试弹窗中增加自动检测疑似广告功能。
5. 每个候选广告区间独立展示 Index 序列、duration 序列、评分、判断依据、hash 和完整 TS URL。
6. 使用主进程下载 TS，并调用现有 `bin/ffmpeg.exe` 生成首帧。
7. 默认展示每个候选区间第一段 TS 的首帧，支持展开查看该区间全部 TS 首帧。
8. 支持对单个候选区间一键覆盖应用 Index 和 duration 配置。
9. 保持原有下载、调试、IPC 和配置兼容。

## 非目标

- 不重写 N_m3u8DL-RE 下载器。
- 不引入 React/Vue 或其他前端框架。
- 不实现 CMS 详情页的“调试去广告”按钮。
- 不实现加入下载队列弹窗中的自动广告截图。
- 不把自动检测参数写入全局配置；检测参数只在当前调试会话中生效。

## 配置设计

新增配置字段：

```js
{
  adIndexSequence: ""
}
```

缺少该字段的旧配置迁移为空字符串。

下载设置新增“去广告 Index 序列”输入框，支持：

```text
89-93;150,152,155-157
```

格式规则：

- `89-93` 表示连续 Index 范围；
- `150,152` 表示离散 Index；
- 多个序列使用分号分隔；
- 每个序列内部可混合逗号和范围；
- 数字必须为非负整数；
- 范围起点大于终点时视为无效并提示；
- 保存时保留规范化后的字符串或等价的可解析格式。

一键应用时直接覆盖两个字段：

```js
{
  adIndexSequence: "89-93",
  adDurationSequence: "4.867,3.333,6.367,2.1,2.967"
}
```

不追加旧配置。如果候选区间某字段为空，则对应配置字段清空。

## 核心模块

新增：

```text
src/main/ad-detector.js
```

模块划分为四层：

### 配置解析层

负责：

- 解析 Index 列表、范围和混合序列；
- 解析 duration 序列；
- 规范化自动检测参数；
- 将候选区间格式化为紧凑 Index 序列，例如 `89-93` 或 `89,91,94`。

### M3U8 分析层

负责：

- 解析 master/media m3u8；
- master playlist 自动选择最高带宽变体；
- 从已有 `meta_selected.json` 或 m3u8 建立统一片段列表；
- 识别并划分 `#EXT-X-DISCONTINUITY` 区间；
- 按需下载候选区间及前后邻居；
- 样本不足或基准不可靠时回退到全量 TS 分析。

自动检测优先复用当前调试弹窗已经存在的 meta 数据；没有 meta 时才独立请求 m3u8。即使复用 meta，码率分析仍需按需下载 TS。

### 媒体处理层

负责：

- 读取 TS 实际响应字节数；
- 计算单片段和区间平均码率；
- 调用现有 ffmpeg 首帧能力；
- 将截图转换为 Base64 data URL 返回 renderer；
- 清理临时文件。

### 调试 UI 层

由现有 `renderer.js` 承载，负责：

- 自动检测按钮和严格/宽松模式；
- 高级检测参数输入；
- 候选区间卡片；
- 首帧懒加载和全部画面展开；
- 单候选应用配置；
- 错误和进度展示。

## 自动检测算法

### 区间划分

以 `#EXT-X-DISCONTINUITY` 为边界切分片段。区间记录：

- 起止 Index；
- 片段数量；
- duration 数组和总时长；
- TS 总字节数和平均码率；
- 前后邻居码率。

不能仅因为存在 discontinuity 就判定为广告。当前样例中 `85-88` 是正常内容，`89-93` 才是疑似广告。

### 默认高级参数

```js
{
  minAdSeconds: 5,
  maxAdSeconds: 90,
  neighborBitrateRatio: 1.7,
  medianBitrateRatio: 1.5,
  maxGroupSegments: 5,
  requireDiscontinuity: true,
  frameTimeoutMs: 30000
}
```

### 评分

严格模式默认启用，至少命中两个主要条件后展示候选；宽松模式允许命中任意一个主要条件后展示候选。候选必须显示评分和命中原因。

主要条件包括：

- discontinuity 区间片段数少于配置的最大值；
- 区间总 duration 位于最小和最大广告时长之间；
- 区间平均码率达到全片中位码率比例；
- 区间平均码率达到相邻区间比例；
- duration 序列完整匹配；
- 满足 discontinuity 边界要求。

duration 序列匹配是增强信号，不把单个高频 duration（例如 `4.171`）视为广告。

### 样例验收行为

对于当前样例 m3u8：

- `85-88` 不应被列为候选；
- `89-93` 应被识别为候选，并按照 playlist discontinuity 切分为 `89-90` 与 `91-93` 两个独立区间；
- 合计播放时间约为 `00:05:56.779` 到 `00:06:16.413`。

## IPC 设计

保留现有：

```text
ad-debug:meta
ad-debug:first-frame
ad-debug:log
```

新增：

```text
ad-debug:auto-detect
ad-debug:apply-config
ad-debug:frame
```

### `ad-debug:auto-detect`

请求参数包括：

```js
{
  url,
  metaText,
  useSystemProxy,
  mode: "strict" | "loose",
  options: {
    minAdSeconds,
    maxAdSeconds,
    neighborBitrateRatio,
    medianBitrateRatio,
    maxGroupSegments,
    requireDiscontinuity,
    frameTimeoutMs
  },
  durationSequence
}
```

返回每个候选区间的：

```js
{
  startIndex,
  endIndex,
  indexSequence,
  durationSequence,
  startTime,
  endTime,
  totalDuration,
  bitrateKbps,
  score,
  reasons,
  segments: [
    {
      index,
      duration,
      hash,
      url,
      bitrateKbps
    }
  ]
}
```

自动检测返回片段信息，但默认首帧通过后续按需请求获取，避免一次生成大量图片。

### `ad-debug:frame`

请求指定 TS URL，返回：

```js
{ ok: true, imageUrl: "data:image/png;base64,..." }
```

或：

```js
{ ok: false, message: "..." }
```

复用现有 ffmpeg 路径解析和临时目录清理逻辑。

### `ad-debug:apply-config`

请求参数：

```js
{
  adIndexSequence,
  adDurationSequence
}
```

主进程覆盖写入配置，返回保存后的配置。只有写入成功后 renderer 才同步输入框。

## 调试界面

现有调试弹窗保留：

- m3u8 地址；
- meta 解析；
- 片段阈值查找；
- duration 序列查找；
- 搜索和按时间定位；
- 原始 meta 输出。

新增自动检测区域：

- “自动检测疑似广告”按钮；
- “严格/宽松”模式选择；
- 高级参数输入；
- 检测进度和错误提示。

每个候选区间独立显示：

- Index 序列；
- duration 序列；
- 时间范围；
- 平均码率；
- 评分；
- 判断依据；
- 每个 TS 的 hash 和完整 URL；
- 默认第一段 TS 首帧。

“展开全部画面”后，按需为区间所有 TS 截取首帧并显示缩略图。截图失败仅影响对应缩略图，并提供重试入口。

每个候选区间提供独立勾选和“一键应用到配置”。应用动作只针对当前候选，不自动合并其他候选。

## 下载匹配逻辑

现有 `extractSuspiciousAdFilenames` 扩展为同时处理：

1. 片段个数阈值；
2. duration 序列；
3. Index 序列。

三种规则得到的文件名集合使用 `Set` 合并去重。Index 序列按配置逐条匹配，匹配到的 Index 片段加入删除集合；duration 序列保持现有逻辑，匹配所有出现位置。

Index 匹配不改变原始片段 Index；Index 是当前媒体 playlist 中的全局片段索引。

## 安全与错误处理

- 仅允许 `http` 和 `https` m3u8/TS URL；
- 所有请求设置超时；
- 限制单个 TS 响应大小；
- 限制并发下载数；
- 下载失败不导致应用崩溃，并在结果中记录失败片段；
- ffmpeg 缺失或截图失败时返回具体错误；
- 临时目录使用随机后缀，并在 finally 中清理；
- 不将 CMS 或 m3u8 返回的 HTML 直接注入页面；
- 配置写入失败时不更新 renderer 本地输入值；
- 自动检测不直接修改全局配置。

## 性能策略

- 首先只下载 discontinuity 候选区间及前后邻居；
- 使用样本估算中位码率；
- 样本不足或候选边界不可靠时自动扩大到全量 TS；
- 首帧只默认生成每个候选第一段；
- 全部首帧通过展开操作懒加载；
- renderer 缓存当前调试会话已请求的首帧结果。

## 测试计划

### 单元测试

覆盖：

- Index 列表、范围和混合格式解析；
- 无效范围处理；
- Index 严格连续匹配；
- duration 序列匹配；
- discontinuity 区间划分；
- 区间时长、码率和邻居码率计算；
- 严格/宽松模式评分；
- Index 序列紧凑格式化；
- 配置迁移、覆盖和空字段清理。

### 集成测试

使用当前示例 m3u8 验证：

- `85-88` 不被误判；
- `89-90` 和 `91-93` 独立展示；
- 结果包含 duration、Index、hash 和完整 URL；
- 默认首帧可生成；
- 展开后每段首帧可生成或显示独立错误；
- 一键应用覆盖两个配置字段；
- Index 和 duration 规则均能进入最终删除集合。

### 回归测试

确认原有阈值去广告、duration 去广告、调试搜索、时间定位、meta 查看、下载队列、取消任务和启动兼容性不变，并执行：

```bash
node --check main.js
node --check preload.js
node --check renderer.js
node --check cms-renderer.js
for f in src/main/*.js; do node --check "$f" || exit 1; done
```

## 验收标准

用户能够：

1. 在下载设置填写 `89-93;150,152,155-157`；
2. 保存并重新打开后配置仍存在；
3. 自动检测复用已有 meta，没有 meta 时也能从 m3u8 工作；
4. 在严格/宽松模式间切换并调整高级参数；
5. 查看多个独立候选区间；
6. 查看每个候选的 Index、duration、码率、评分、hash 和完整 URL；
7. 查看第一段首帧并展开查看全部首帧；
8. 单独覆盖应用当前候选的 Index/duration 配置；
9. 配置为空时不会残留旧规则；
10. 下载时 Index、duration 和阈值规则可以同时生效。
