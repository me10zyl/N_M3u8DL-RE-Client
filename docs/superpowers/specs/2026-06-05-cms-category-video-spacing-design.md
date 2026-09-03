# CMS 分类与影片列表间距设计

## 目标

将 CMS 影片列表中“分类栏”和下方影片网格之间的间距调整为 10px，同时保持分类子菜单的 hover 展开和鼠标移入行为正常。

## 方案

仅调整 `style.css` 中 `.cms-video-grid` 的布局：使用逻辑属性 `margin-block-start: 10px` 增加影片网格的上边距。

分类子菜单继续使用现有的 `top: 100%` 定位，不额外移动子菜单，避免分类按钮与子菜单之间产生 hover 断点。

## 影响范围

- 文件：`style.css`
- 不修改 CMS 分类渲染逻辑或事件处理。
- 不影响影片网格内部卡片间距。
- 不影响移动端现有的分类布局。

## 验证

- 检查 CSS 修改位置和语法。
- 检查分类子菜单仍由 `.cms-category-group:hover` 和 `:focus-within` 控制显示。
- 检查 Electron 渲染相关 JavaScript 无语法错误。
