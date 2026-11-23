# Coco Studio · Banner 工作流

把 Jira 工单变成 Banner 的可视化工作流：读取 Jira → Claude 拆解需求 → 提示词 → Figma 生图 / Coco 改图 → 套模板合成 Banner，结果写回 Figma 文件。

- 在线完整版（需要 claude.ai 连接 Atlassian Rovo 与 Figma）：https://claude.ai/artifact/YSxXvkSAhxxmtmc1FcMQKR
- 单文件离线打开时为预览模式：可体验画布、框选、对齐、整理，不能读 Jira 或生图。

## 目录

| 目录 | 内容 |
|---|---|
| `01-工作流页面/banner-flow.html` | 工作流主页面（在 claude.ai 中运行） |
| `02-Figma代码图层/` | Figma 代码图层用的预览版（`index.html`、`App.tsx`） |
| `03-Figma插件/` | 早期方案：开发版插件（需配合后端）、已发布的账号插件源码 |
| `04-独立后端/` | 早期方案：FastAPI 后端（Jira 读取、需求拆解、生图适配） |
| `05-Coco素材/` | Coco 标准形象 |
| `06-测试/` | jsdom 自动化测试（示例数据已脱敏）：`npm i && npm test` |

## 主要功能

- Jira 工单看板：统计、标出我负责的单、勾选或一键生成
- 节点画布：拖拽、框选、吸附对齐、自动整理、撤销重做、小地图
- 工单分组、运行队列、运行跟随与高亮、生成进度与汇总
- 固定生成图（改文案只重新合成）、参考图（上传 / 粘贴 / 拖入 / Figma 图层链接）
- Coco 标准形象：用到 Coco 时复制 Figma 母版图层，用 Figma「Edit with prompt」改图，五官与比例不变
- 自动化：定时刷新看板、新工单自动拆解、可选自动生图（带上限）、自动重试、自动整理
- 清理已完成：框选或一键清理，完成记录保留在看板

## 已知限制

- 页面需在 claude.ai 中打开才能使用连接器
- Figma 改图需在浏览器中点击，可让 Claude 在对话中代为操作
- 网页图片链接受页面安全限制无法直接下载，请复制粘贴图片或使用 Figma 图层链接
