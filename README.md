# Make it me · 一键仿拍

移动优先的 AI 仿拍 Web Demo。流程覆盖参考素材分析、按镜头规划最小身份素材、引导式临时采集、本地关键帧筛选、Mock 生成与结果对比。

## 本地运行

```bash
npm install
npm run dev
```

复制 `.env.example` 为 `.env.local`。Reference Semantic Analyzer 默认使用 `ANALYZER_PROVIDER=mock`，无需 API Key 即可运行；切换到 `openai` 或 `gemini` 时，对应配置 `OPENAI_API_KEY` 或 `GEMINI_API_KEY`。密钥只由 `app/api/analyze/route.ts` 在服务端读取，不进入浏览器包。

远程 VLM 请求还需要配置 `APP_ACCESS_CODE`。用户输入的访问码由浏览器通过请求头发送，避免公开部署被匿名消耗额度。图片生成仍独立使用现有 `AI_PROVIDER` 配置。

## Reference Analyzer

```text
Reference media
  ├─ Geometry Analyzer (browser)
  │    ├─ media dimensions / video representative frame
  │    ├─ FaceDetector when browser capability exists
  │    └─ explicitly-labelled geometry heuristics
  ├─ Semantic Analyzer (server proxy)
  │    ├─ OpenAI / Gemini structured JSON
  │    └─ automatic Mock fallback
  └─ Fusion
       ├─ real geometry wins
       ├─ VLM supplies photographic semantics
       └─ ReferenceAnalysis → TargetShot → Requirement Planner
```

核心契约为 `services/types.ts` 中的 `ReferenceAnalysis`。每个分析字段通过 `provenance` 标记来源、能力名称、是否可用和可选置信度；UI 默认只显示消费级摘要，技术信息收在“分析详情 / 开发信息”中。

### 当前能力

| 能力 | 状态 | 来源 / 说明 |
| --- | --- | --- |
| 图片宽高 | 已实现 | 浏览器真实媒体元数据 |
| 视频宽高、时长、代表帧 | 已实现 | 浏览器解码并抽取首段代表帧 |
| 人脸数量、主脸 Bounding Box | 条件可用 | 浏览器支持 Shape Detection `FaceDetector` 时真实执行 |
| 人物区域、人物位置、Body Coverage | 启发式 | 基于真实人脸框估算，明确标记 `geometry-heuristic` |
| 场景、构图、机位、视线、表情、姿态、外观 | 已实现 | OpenAI / Gemini VLM；无 Key 或失败时 Mock fallback |
| Structured JSON 校验 | 已实现 | 服务端 schema 约束 + 防御性解析；失败返回 warning |
| MediaPipe Face / Pose Landmarker | 已预留 | adapter capability 为 false，本版未引入额外 WASM/模型包体 |
| Person Segmentation / Mask | 未实现 | adapter capability 为 false |
| Depth / Occlusion | 未实现 | adapter capability 为 false |
| 视频 timeline / pose envelope | 类型已预留 | 当前只写入代表帧 timeline，未做多帧追踪 |

## 代码结构

- `services/geometry-analyzer.ts`：浏览器几何能力探测、媒体解码、FaceDetector 与启发式推导
- `services/semantic-analyzer.ts`：浏览器端 VLM adapter、响应校验与本地 Mock fallback
- `services/reference-analyzer.ts`：Geometry + Semantic Fusion、TargetShot 派生
- `services/requirement-planner.ts`：从 `ReferenceAnalysis` 规划 Simple / Standard / Advanced 采集
- `app/api/analyze/route.ts`：OpenAI / Gemini 服务端代理、structured JSON 与自动 Mock fallback
- `components/guided-capture.tsx`：相机引导、自动抓帧和权限回退
- `services/capture-quality.ts`：浏览器端亮度、清晰度与最佳帧选择

## 检测与隐私边界

- 不可用能力不会填充伪造数值，统一返回 `available=false` 或 `null`。
- VLM 不覆盖真实 CV 产生的 Bounding Box、可见度或后续 Landmarker 头部姿态。
- Demo 不录制或上传整段 Guided Capture 视频，只保留自动抓取的候选关键帧。
- `EphemeralIdentitySession` 只存在于当前页面状态；完成或重置流程时清空，不声称服务器永久删除。
- 当前 Generator Adapter 仍为 Mock；项目不包含登录、支付、数据库或云端用户资产存储。
