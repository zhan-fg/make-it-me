# Make it me · 一键仿拍

一款移动优先的消费级 AI 仿拍产品。当前 Web Demo 已实现从参考素材分析、按镜头规划最小身份素材、引导式临时采集、本地筛选关键帧，到 Mock 生成和结果对比的完整体验。

## 本地运行

```bash
npm install
npm run dev
```

复制 `.env.example` 为 `.env.local`，并配置自定义的 `APP_ACCESS_CODE`。通过 `AI_PROVIDER=openai` 使用 OpenAI，或通过 `AI_PROVIDER=wanx` 使用通义千问视觉分析与通义万相图像编辑。对应配置 `OPENAI_API_KEY` 或 `DASHSCOPE_API_KEY`。用户在首页输入访问码后才能调用付费接口。部署到 Vercel 时应在项目环境变量中配置这些值，不能把密钥提交到仓库。

## 架构

- `app/`：Next.js App Router 页面与全局视觉样式
- `components/guided-capture.tsx`：相机引导、自动抓帧和权限回退
- `services/types.ts`：Target Shot、采集结果和临时会话等核心契约
- `services/shot-analyzer.ts`：前端 Mock Target Shot Analyzer
- `services/requirement-planner.ts`：确定性三级采集规则
- `services/capture-quality.ts`：浏览器端亮度、清晰度与最佳帧选择
- `services/generator-adapter.ts`：Mock Generator Adapter
- `app/api/analyze/`：服务端多模态场景与 Shot 分析
- `app/api/generate/`：服务端多参考图生成接口
- `services/api-adapters.ts`：浏览器端 API adapter
- `services/mock-adapters.ts`：离线 Mock adapter，可用于开发回退

## 检测边界

- 亮度和清晰度使用 Canvas 在浏览器本地真实计算。
- 浏览器实现 `FaceDetector` 时，真实记录人脸数量和相对大小。
- 无 `FaceDetector` 时，头部方向采用明确标注的定时引导；姿态匹配、遮挡和置信度标记为不可用。
- Demo 不录制或上传整段视频，只保留自动抓取的候选关键帧。
- `EphemeralIdentitySession` 仅存在于当前页面状态；完成或重置流程时清空，不声称服务器永久删除。

真实 AI API 路由仍保留；新的 Target Shot Analyzer 和 Generator 流程当前使用 Mock Adapter。项目暂不包含登录、支付、数据库或云端用户资产存储。

通义万相推荐配置业务空间专属 `DASHSCOPE_BASE_URL`，例如北京地域的 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1`。API Key、模型与域名必须属于同一地域。
