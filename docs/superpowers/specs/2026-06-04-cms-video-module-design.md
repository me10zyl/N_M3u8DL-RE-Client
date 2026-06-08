# CMS 影片模块设计

## 背景

当前应用是基于 Electron 的 N_m3u8DL-RE 图形界面客户端，已有功能围绕批量 m3u8 下载、任务队列、去广告调试和命令输出展开。本次新增 CMS 影片模块，目标是在不破坏原下载功能的前提下，让用户可以通过 Mac CMS 接口浏览影片、搜索、查看详情、播放、选集，并直接复用现有下载能力完成 m3u8 下载。

参考项目为 [lhccong/fishTV](https://github.com/lhccong/fishTV)。fishTV 的 CMS 访问方式包括：

- 列表：`/provide/vod/?ac=list&pg=1&pagesize=12&t=分类ID`
- 搜索：`/provide/vod/?ac=list&wd=关键词`
- 详情：`/provide/vod/?ac=detail&ids=影片ID`
- 多资源站切换：使用当前影片名在目标资源站搜索，并取匹配结果进入详情
- 播放地址：通过 `vod_play_url` 按 `#` 拆集数，再按 `$` 拆集名和 URL

本项目会吸收 fishTV 的 CMS 交互方式，但在验证码处理、跨资源站匹配、下载复用和配置管理上做得更完整。

## 目标

- 左侧侧边栏只保留两个入口：下载、CMS 影片。
- 原下载功能保持原体验和原 IPC 兼容。
- CMS 影片模块在右侧内容区内部提供影片列表、CMS 设置、历史、下载中心。
- CMS 下载必须复用原有下载队列、去广告、系统代理、临时目录、N_m3u8DL-RE 路径和命令输出。
- 用户在 CMS 下载时不需要手动填写下载参数；下载目录来自下载设置里的默认下载目录。
- 支持资源站验证码场景：检测、打开验证窗口、保存 Cookie/User-Agent、重试请求。
- 支持详情页播放源切换和跨资源站源切换。

## 非目标

- 不重写下载器，不替代 N_m3u8DL-RE。
- 不引入 React/Vue 等框架；继续沿用当前 Electron + 原生 HTML/CSS/JS 架构。
- 不把 CMS 历史设计为完整观看进度系统；第一版记录影片级历史。
- 不将 CMS 设置、历史、下载中心放入左侧侧边栏。

## 信息架构

### 左侧侧边栏

左侧只包含两个主入口：

1. **下载**
   - 对应现有原下载功能。
   - 保留原下载设置入口和设置区域。
   - 保留批量输入、下载页面、任务列表、日志、去广告调试等体验。

2. **CMS 影片**
   - 新模块入口。
   - 右侧内容区内部通过顶部按钮切换 CMS 专属页面。

### 下载页

下载页保留原功能，并在下载设置里新增 **默认下载目录**。

默认下载目录使用规则：

- 原下载功能新建下载页面时，`最终目录` 默认填入该目录。
- 原下载页面仍允许用户手动修改某个页面的最终目录。
- CMS 下载时自动使用默认下载目录作为 `finalRoot`。
- 如果默认下载目录为空，CMS 下载弹框阻止提交并提示用户先配置。

### CMS 影片页

CMS 影片页右侧内容区顶部提供按钮切换：

- 影片列表
- CMS 设置
- 历史
- 下载中心

影片列表页顶部还包含：

- 当前资源站下拉切换
- 搜索框
- 分类筛选
- 分页控件

详情页属于 CMS 内容区内部页面，从列表点击进入，支持返回列表。

## CMS 接口设计

### 请求入口

CMS 请求统一由主进程代理，renderer 不直接访问 CMS：

- `window.api.cmsGetTypes(sourceId)`
- `window.api.cmsGetVideos(payload)`
- `window.api.cmsSearchVideos(payload)`
- `window.api.cmsGetDetail(payload)`
- `window.api.cmsOpenVerification(sourceId)`
- `window.api.cmsTestSource(source)`

主进程代理的原因：

- 避免浏览器跨域限制。
- 统一处理 Cookie 和 User-Agent。
- 统一处理 JSON/XML/HTML 响应。
- 方便创建验证码 BrowserWindow。
- 降低 renderer 注入风险。

### Mac CMS API

默认支持以下接口：

- 分类：`?ac=list`
- 列表：`?ac=list&pg=<page>&pagesize=<size>&t=<typeId>`
- 搜索：`?ac=list&wd=<keyword>&pg=<page>&pagesize=<size>`
- 详情：`?ac=detail&ids=<vodId>`

搜索请求不强制带分类 `t`，与 fishTV 保持一致。

### 字段归一化

影片列表和详情统一归一为内部结构：

```js
{
  vodId: "123",
  vodName: "影片名",
  vodPic: "https://...",
  typeName: "国产剧",
  vodYear: "2026",
  vodArea: "内地",
  vodRemarks: "更新至 12 集",
  vodTime: "2026-06-04",
  vodContentText: "纯文本简介",
  raw: {}
}
```

更新信息优先级：

1. `vod_remarks`
2. `vod_serial`
3. `vod_pubdate`
4. `vod_time`

简介展示为纯文本，剥离 HTML 标签，不直接注入资源站返回的 HTML。

### 播放源解析

支持两类播放地址：

1. 单播放源：

```text
第01集$url#第02集$url
```

2. 多播放组：

```text
vod_play_from = ffm3u8$$$bfzym3u8
vod_play_url  = 播放组1集数$$$播放组2集数
```

解析后统一结构：

```js
[
  {
    groupKey: "ffm3u8",
    groupName: "ffm3u8",
    episodes: [
      { title: "第01集", url: "https://example.com/1.m3u8" }
    ]
  }
]
```

没有 m3u8 URL 的集数不参与下载，并在 UI 中标记不可下载。

## 资源站管理

CMS 设置页支持完整增删改：

- 名称
- 接口地址
- 启用状态
- Cookie 状态
- User-Agent 状态
- 测试连接
- 打开验证窗口

接口地址允许填写完整 API 地址，例如：

```text
https://example.com/provide/vod/
https://example.com/api.php/provide/vod/
```

保存时规范化为：

```js
{
  id: "source-1",
  name: "非凡云",
  baseUrl: "https://example.com",
  apiPath: "/provide/vod/",
  enabled: true,
  userAgent: "",
  cookies: [],
  lastVerifiedAt: "",
  verificationHint: ""
}
```

删除资源站时：

- 不硬删除历史中的快照信息。
- 历史继续保留 `sourceName`。
- 如果删除当前激活资源站，自动切换到下一个启用资源站。
- 如果没有启用资源站，CMS 列表显示引导去设置新增。

## 验证码处理

### 检测条件

主进程遇到以下情况时标记为 `needsVerification`：

- HTTP 状态为 403、429、503。
- 响应体不是 JSON/XML，而是 HTML。
- JSON 解析失败且响应像网页。
- 响应内容包含常见关键词：`captcha`、`验证码`、`verify`、`cloudflare`。

### 处理流程

1. CMS 请求返回：

```js
{
  ok: false,
  needsVerification: true,
  sourceId: "source-1",
  url: "https://example.com/provide/vod/?ac=list",
  snippet: "..."
}
```

2. renderer 显示“资源站需要验证”。
3. 用户点击“打开验证窗口”。
4. 主进程创建独立 BrowserWindow，打开资源站接口地址或根域名。
5. 用户手动完成验证。
6. 用户关闭窗口后，主进程读取该 session 的 Cookie 和 User-Agent。
7. Cookie/User-Agent 保存到对应 CMS 资源站配置。
8. 用户重试当前请求。

验证码窗口不自动绕过验证码，只提供用户手动完成验证的浏览器环境。

## 影片列表与搜索

影片列表展示：

- 大图
- 影片名
- 更新信息

支持：

- 动态分类获取。
- 分类点击。
- 分页。
- 搜索。
- 资源站切换。

分类获取优先调用 CMS 分类接口。若资源站不支持分类或返回为空，则展示内置常见分类兜底，并提示“该资源站未返回分类，当前使用默认分类”。

搜索无结果、接口失败、验证码、分类为空等情况都显示明确空状态或错误状态。

## 详情、播放与跨资源站源

详情页展示：

- 封面
- 名称
- 分类、年份、地区
- 更新信息
- 纯文本简介
- 播放区域
- 播放组切换
- 选集
- 下载按钮

### 当前资源站播放组

详情页先展示当前资源站详情接口返回的播放组。用户可在播放组之间切换，选集列表随播放组变化。

### 跨资源站切换

当用户在详情页切换到其他资源站时：

1. 使用当前影片名搜索目标资源站。
2. 匹配候选结果：
   - 完全同名优先。
   - 去掉空格、全角空格、常见标点后同名次之。
   - 否则取第一条并显示“可能不完全匹配”。
3. 获取匹配影片详情。
4. 详情页播放组、选集和下载弹框切换到目标资源站的数据。

## 下载设计

### 下载弹框

详情页点击下载按钮后弹出弹框：

- 展示影片名、资源站、播放组。
- 可切换资源站和播放组。
- 集数列表支持全选、全不选、单集勾选。
- 集数显示集名和 m3u8 URL 简短预览。
- 默认勾选全部可下载集数。

确认下载时，将选中集数组装为现有 `tasks:start` 格式：

```js
{
  showName: "影片名",
  finalRoot: "默认下载目录",
  items: [
    { episodeTitle: "第01集", url: "https://example.com/1.m3u8" }
  ]
}
```

### 下载队列复用

底层只保留一套下载队列：

- `queue`
- `currentTask`
- `currentProcess`
- `runNext()`
- `tasks:start`
- `task:update`

CMS 下载复用：

- N_m3u8DL-RE 路径
- 临时目录
- 默认下载目录
- 系统代理
- 去广告开关
- 广告片段阈值
- duration 序列去广告
- 命令输出
- 任务状态

CMS task 只增加可选元数据：

```js
{
  source: "cms",
  cmsSourceId: "source-1",
  cmsSourceName: "非凡云",
  vodId: "123",
  vodName: "影片名",
  episodeTitle: "第01集",
  playGroup: "ffm3u8"
}
```

原下载页不依赖这些字段，因此不会受影响。

## 下载中心

CMS 页面顶部“下载中心”按钮显示待下载和进行中的数量。

下载中心默认按影片分组展示 CMS 发起的任务：

- 影片名
- 来源资源站
- 总任务数
- 已完成数
- 进行中数
- 排队数
- 失败数

点击某个影片进入下载详情：

- 每集状态
- 错误信息
- 命令输出日志
- 停止当前任务
- 停止全部
- 删除排队任务

“停止全部”影响全局下载队列，UI 必须明确提示。

原下载页显示原下载页发起的任务；CMS 下载中心主要显示 CMS 发起的任务。底层队列仍是同一个串行队列。

## 历史记录

历史记录为影片级，不记录播放进度。

记录时机：进入详情页即记录。

去重规则：同一 `sourceId + vodId` 重复点击时更新 `clickedAt`，不重复插入。

最多保留 100 条，超出删除最旧。

历史项结构：

```js
{
  vodId: "123",
  vodName: "影片名",
  vodPic: "https://...",
  sourceId: "source-1",
  sourceName: "非凡云",
  clickedAt: "2026-06-04T00:00:00.000Z"
}
```

历史页点击后回到详情页。如果来源资源站已删除，则提示“来源已删除，可选择当前资源站重新搜索该影片”。

## 配置结构与迁移

继续使用现有 Electron `config.json`，向后兼容。

新增字段：

```js
{
  defaultFinalRoot: "D:\\Videos",
  cms: {
    activeSourceId: "source-1",
    sources: [],
    history: []
  }
}
```

保留原字段：

- `exePath`
- `tempRoot`
- `removeAds`
- `useSystemProxy`
- `adSegmentThreshold`
- `adDurationSequence`
- `pages`
- `activePageId`
- `showName`
- `finalRoot`
- `batchInput`

迁移规则：

- 老配置没有 `defaultFinalRoot` 时，优先使用旧 `finalRoot`，没有则为空字符串。
- 老配置没有 `cms` 时，创建空 CMS 配置。
- 老配置中的下载页结构保持不变。

## 代码组织

为了避免 `main.js` 和 `renderer.js` 继续膨胀，新增模块化目录：

```text
main.js
preload.js
index.html
style.css

src/main/config-store.js
src/main/download-service.js
src/main/cms-service.js
src/main/cms-verification.js
src/main/ipc.js

src/renderer/state.js
src/renderer/download-view.js
src/renderer/settings-view.js
src/renderer/cms/cms-view.js
src/renderer/cms/cms-list-view.js
src/renderer/cms/cms-detail-view.js
src/renderer/cms/cms-settings-view.js
src/renderer/cms/cms-history-view.js
src/renderer/cms/cms-download-center.js
src/renderer/cms/cms-parsers.js
```

原 IPC 名称保持兼容：

- `config:get`
- `config:set`
- `dialog:pick-exe`
- `dialog:pick-dir`
- `tasks:start`
- `tasks:cancel`
- `tasks:stop-all`
- `tasks:remove`
- `ad-debug:meta`
- `ad-debug:first-frame`
- `task:update`
- `ad-debug:log`

新增 CMS IPC 不替代原 IPC。

## 错误处理

CMS 模块必须覆盖以下状态：

- 无资源站：引导去 CMS 设置新增接口。
- 接口失败：显示 HTTP 状态或解析错误。
- 验证码：显示“需要验证”并提供打开验证窗口。
- 分类为空：显示“该资源站未返回分类”，允许使用搜索。
- 搜索无结果：显示空状态。
- 跨资源站匹配不确定：显示“可能不是同一影片”。
- 播放地址为空：禁用播放和下载。
- 默认下载目录为空：阻止 CMS 下载，提示去下载设置配置。
- `tasks:start` 返回失败：展示原错误，例如程序路径不存在、目录缺失等。

## 安全要求

- 不直接注入资源站返回的 HTML。
- 简介转纯文本展示。
- 不使用 `innerHTML` 渲染 CMS 内容。
- 图片加载失败显示占位图。
- CMS 请求失败信息不暴露本地敏感路径之外的信息。
- 验证码窗口只服务当前资源站验证，不自动绕过验证码。

## 验证计划

### 纯函数验证

需要覆盖：

- CMS API URL 拼接。
- CMS 响应归一化。
- `vod_play_from / vod_play_url` 播放组解析。
- 历史去重和 100 条上限。
- 配置迁移。

### 手动回归

必须验证：

- 原下载页能正常加载配置。
- 原批量输入解析正常。
- 原下载任务仍能加入队列。
- 去广告调试入口仍能打开。
- 默认下载目录能带入新建原下载页面。
- CMS 设置能增删改资源站。
- CMS 连接测试能识别成功、失败、验证码。
- CMS 列表、分类、搜索、分页正常。
- CMS 详情页能播放和选集。
- 跨资源站切换能按影片名搜索匹配。
- CMS 下载弹框能选择播放组和集数。
- CMS 下载调用原下载队列。
- 去广告参数在 CMS 下载中仍生效。
- CMS 下载中心能展示分组、状态、日志。
- 历史页能展示最近点击影片并跳回详情。

## 风险与缓解

### 风险：一次性完整实现范围较大

缓解：代码上按模块拆分；下载内核保持一套；每个模块用明确 IPC 和纯函数边界。

### 风险：不同 CMS 资源站字段不完全一致

缓解：响应归一化时采用宽松字段读取；分类失败有兜底；播放源为空时给出明确提示。

### 风险：验证码流程无法覆盖所有资源站

缓解：验证码窗口采用真实 BrowserWindow，保存 Cookie/User-Agent；仍无法通过时给出失败提示，不阻塞其他资源站。

### 风险：影响原下载功能

缓解：原 IPC 名称保持兼容；原下载任务字段保持必需字段不变；CMS 只增加可选元数据；手动回归原下载功能。