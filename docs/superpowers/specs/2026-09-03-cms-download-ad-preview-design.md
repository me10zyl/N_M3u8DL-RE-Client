# CMS 下载流程去广告调试与截图预览设计

## 背景

第一阶段已实现去广告 Index 序列、自动广告检测和调试首帧能力。本阶段将这些能力接入 CMS 详情页和 CMS 加入下载队列流程，确保用户能针对某一集直接调试去广告，并在确认下载前预览当前去广告配置实际会排除的广告 TS 首帧。

## 目标

1. CMS 影片详情页每集增加“调试去广告”按钮。
2. 点击后将该集 m3u8 地址带入已有去广告调试弹窗。
3. 打开调试弹窗时清空旧集的调试会话状态。
4. 下载设置增加“下载时自动展示去广告截图”开关。
5. CMS 加入下载队列弹窗可后台预览第一个被选中剧集的广告 TS 首帧。
6. 预览严格依据当前下载配置实际会使用的阈值、Index、duration 去广告规则。
7. 预览不阻塞用户确认加入下载队列。
8. 保持原下载页、现有 CMS 队列和第一阶段功能兼容。

## 非目标

- 不改变 N_m3u8DL-RE 下载器命令行协议。
- 不以自动检测结果替代当前配置去广告规则。
- 不在 CMS 弹窗中自动写入或覆盖 Index/duration 配置。
- 不实现广告截图长期缓存。
- 不修改第一阶段自动检测的严格/宽松模式与高级参数。

## 配置

新增配置字段：

```js
{
  showAdPreviewOnCmsDownload: false
}
```

旧配置缺少该字段时迁移为 `false`。

下载设置增加复选框：

```text
下载时自动展示去广告截图
```

仅同时满足以下条件时启动 CMS 下载弹窗预览：

```text
showAdPreviewOnCmsDownload === true
```

并且当前去广告规则至少有一项启用：

```text
removeAds === true
或 adIndexSequence 非空
或 adDurationSequence 非空
```

## 详情页调试去广告

### 按钮

CMS 详情页每个有效的 HTTP/HTTPS m3u8 集数操作区新增：

```text
调试去广告
```

继续保留已有的“播放”和“打开源地址”操作。

若该集 URL 无效或不是 HTTP/HTTPS m3u8，按钮禁用并显示原因。

### 交互

点击“调试去广告”后：

1. 将该集 URL 设置到 `adDebugUrl`；
2. 清空旧调试会话中的：
   - `meta_selected.json` 文本和对象；
   - 自动检测候选；
   - 阈值与 duration 查找结果；
   - 首帧预览；
   - 搜索匹配和定位状态；
   - 调试状态提示；
3. 打开现有去广告调试弹窗；
4. 不自动生成 meta，也不自动执行自动检测。

用户自行点击“获取 meta_selected.json”或“自动检测疑似广告”。

## CMS 下载弹窗广告预览

### 预览对象

打开 CMS “加入下载队列”名称确认弹窗后，按当前详情页播放列表顺序，取第一个被选中的、可下载的剧集 m3u8 地址。

不会忽略用户勾选状态，也不会在第一个集数失败时自动换用后续集数。

### 数据来源

新增主进程 IPC：

```text
ad-debug:configured-preview
```

该 IPC：

1. 校验 m3u8 URL 和当前 N_m3u8DL-RE、临时目录配置；
2. 使用 N_m3u8DL-RE 生成 `meta_selected.json`；
3. 读取当前配置：
   - `removeAds`；
   - `adSegmentThreshold`；
   - `adIndexSequence`；
   - `adDurationSequence`；
4. 调用与实际下载相同的 `extractSuspiciousAdFilenames` 去广告匹配逻辑；
5. 从 meta 的完整片段列表中返回当前实际会被排除的 TS。

返回结构：

```js
{
  ok: true,
  matched: true,
  url: "https://example.com/episode.m3u8",
  segments: [
    {
      index: 89,
      duration: 4.867,
      hash: "c18ad77cee6eecb0f04302c6f85bcfd3",
      url: "https://example.com/segment.ts?hash=c18ad77cee6eecb0f04302c6f85bcfd3"
    }
  ]
}
```

未命中时：

```js
{
  ok: true,
  matched: false,
  segments: []
}
```

### 首帧

CMS renderer 对返回的每个命中 TS 都调用现有 `ad-debug:first-frame` 能力，生成首帧。首帧请求并发限制为 3。

每个 TS 展示：

- 首帧缩略图；
- Index；
- duration；
- hash；
- 完整 TS URL。

弹窗内使用可滚动网格展示全部命中片段。不会折叠为仅展示区间第一帧。

### 弹窗状态

预览区状态包括：

```text
正在按当前配置解析广告片段…
未匹配到当前配置的广告片段
正在获取 5 张广告首帧…
已获取 5/5 张广告首帧
其中 1 张首帧获取失败
```

预览请求在弹窗打开后后台启动。用户可立即点击“确认加入”，不会等待解析或截图完成。

## IPC 与模块职责

### `src/main/ad-debug.js`

新增：

```text
ad-debug:configured-preview
```

复用：

- `parseMetaSelected`；
- `extractSuspiciousAdFilenames`；
- `getAllMediaSegments` 或等价完整片段遍历；
- 当前 N_m3u8DL-RE 解析和系统代理配置；
- 随机临时目录和 finally 清理。

仅接受 HTTP/HTTPS URL，失败时返回具体错误而不抛到 renderer。

### `preload.js`

暴露安全接口：

```js
previewConfiguredAds(payload)
```

不向 renderer 暴露通用文件或任意网络访问能力。

### `cms-renderer.js`

负责：

- 详情页单集“调试去广告”按钮；
- 带入 URL、清空并打开调试弹窗；
- 名称确认弹窗打开时判断配置和启动预览；
- 最新预览请求 token 管理；
- 并发受限的逐 TS 首帧展示；
- 无命中、解析失败、单图失败状态展示。

### `renderer.js`

负责：

- 下载设置开关读取与保存；
- 暴露一个供 CMS renderer 调用的受控函数，用来将指定 URL 打开为干净的去广告调试会话；
- 不改变原下载页的批量下载行为。

## 预览并发、失效与异常

每次打开或重新打开 CMS 下载名称确认弹窗时生成新的预览 token。

当发生以下事件时，旧 token 失效：

- 关闭弹窗；
- 打开另一个影片或另一批下载；
- 取消当前名称确认；
- 重新打开名称确认弹窗。

异步解析或首帧请求完成时，只有 token 仍为当前 token 才能更新 UI，避免旧结果覆盖新弹窗。

失败处理：

- meta 解析失败：显示错误，确认加入仍可用；
- 未匹配广告：显示“未匹配到当前配置的广告片段”；
- 单张首帧失败：该缩略图显示错误，其他截图继续；
- 临时目录和截图目录总是在 finally 中清理；
- 不将 CMS/m3u8 返回的 HTML 直接插入 renderer。

## 测试与验收

### 手动验收

1. CMS 有效 m3u8 集数显示“调试去广告”；
2. 点击后去广告调试弹窗带入对应 URL；
3. 旧 meta、结果、截图和搜索状态被清空；
4. 设置开关默认关闭，保存后重启仍可恢复；
5. 开关关闭时，打开 CMS 名称确认弹窗不请求预览；
6. 没有任何去广告规则时不请求预览；
7. 多选集数时只取播放列表顺序中第一个选中集数；
8. 预览片段列表与下载时实际 `--ad-keyword` 使用的片段集合一致；
9. 所有命中 TS 都显示或尝试显示首帧；
10. 无命中、解析失败、单图失败、关闭弹窗均不阻止确认入队；
11. 原下载页和 CMS 队列任务状态正常。

### 语法检查

```bash
node --check main.js
node --check preload.js
node --check renderer.js
node --check cms-renderer.js
for f in src/main/*.js; do node --check "$f" || exit 1; done
```
