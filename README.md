# Make it me · AI 写真

移动优先的 AI 写真 Web Demo。当前主流程已收缩为：选择原创写真模板、上传一张自拍、通过 Gemini Nano Banana 多图参考生成写真、查看和下载真实结果。旧 Reference Analyzer 与 DashScope 仿拍模块仍保留在代码中，暂不作为首页主流程。

## 本地运行

```bash
npm install
npm run dev
```

复制 `.env.example` 为 `.env.local`。写真主流程需要配置 `GEMINI_API_KEY`，可通过 `GEMINI_IMAGE_MODEL` 选择图片模型，默认使用 `gemini-3.1-flash-image`。密钥只由 `app/api/portrait-generate/route.ts` 在服务端读取，不进入浏览器包。

## 写真主流程

- `services/portrait-templates.ts`：13 套 AI 原创写真模板与自拍要求，覆盖职场、韩式、东方、港风、法式、户外、四季、旅拍、艺术和男士风格
- `services/portrait-types.ts`：模板、生成请求和真实结果契约
- `app/api/portrait-generate/route.ts`：根据 `templateId` 在服务端读取固定模板，只接收用户自拍并调用 Gemini 多图生成
- `app/page.tsx`：模板选择 → 自拍检查 → 真实生成 → 下载结果
- 自拍在浏览器本地保持原始宽高比缩放至最长边 1600px，使用高质量重采样与不低于 84% 的 JPEG 质量，优先保留人脸细节且不裁切、不拉伸
- 生成失败会显示真实错误，不会回退成 Mock 成功
- 当前自拍检查包括格式、文件大小和最低分辨率；人脸数量、遮挡和清晰度评分是下一步增强项

远程 VLM 与图片生成不再要求体验访问码。公开部署仍通过服务端请求频率限制和图片大小限制控制滥用，图片生成继续使用现有 `AI_PROVIDER` 配置。

## Reference Analyzer

```text
Reference media
  ├─ Geometry Analyzer (browser)
  │    ├─ media dimensions / video representative frame
  │    ├─ MediaPipe Face Landmarker（默认）
  │    ├─ MediaPipe Pose Landmarker（默认）
  │    ├─ FaceDetector（原生降级路径）
  │    └─ explicitly-labelled geometry heuristics
  ├─ Semantic Analyzer (server proxy)
  │    ├─ DashScope/Qwen（主路径）或 OpenAI / Gemini structured JSON
  │    └─ automatic Mock fallback
  └─ Fusion
       ├─ real geometry wins
       ├─ VLM supplies photographic semantics
       └─ ReferenceAnalysis → TargetShot → Requirement Planner
```

核心契约为 `services/types.ts` 中的 `ReferenceAnalysis`。每个分析字段通过 `provenance` 标记来源、能力名称、是否可用和可选置信度；UI 默认只显示消费级摘要，技术信息收在“分析详情 / 开发信息”中。

结果页分别展示 DashScope 语义、人脸几何和人体姿态状态。Requirement Planner 仅在 MediaPipe 提供可靠正脸角度和可见度时选择 Simple；几何信息不足、VLM 推测或 Mock 降级时采用更保守的 Standard / Advanced，并通过 `basis` 与 `basisSummary` 说明规划依据。

### 当前能力

| 能力 | 状态 | 来源 / 说明 |
| --- | --- | --- |
| 图片宽高 | 已实现 | 浏览器真实媒体元数据 |
| 视频宽高、时长、代表帧 | 已实现 | 浏览器解码并抽取首段代表帧 |
| 人脸数量、主脸 Bounding Box、头部姿态 | 已实现 | MediaPipe Face Landmarker；模型不可用时降级至浏览器 `FaceDetector` |
| 人体关键点、人物区域、身体朝向 | 已实现 | MediaPipe Pose Landmarker，本地 WASM 推理 |
| 人物位置、Body Coverage | 已实现 | 基于真实 Landmarker 结果推导并标记来源 |
| 场景、构图、机位、视线、表情、姿态、外观 | 已实现 | DashScope/Qwen、OpenAI 或 Gemini VLM；无 Key 或失败时 Mock fallback |
| Structured JSON 校验 | 已实现 | 服务端 schema 约束 + 防御性解析；失败返回 warning |
| Person Segmentation / Mask | 未实现 | adapter capability 为 false |
| Depth / Occlusion | 未实现 | adapter capability 为 false |
| 视频 timeline / pose envelope | 类型已预留 | 当前只写入代表帧 timeline，未做多帧追踪 |

## 代码结构

- `services/geometry-analyzer.ts`：浏览器媒体解码、MediaPipe Face/Pose Landmarker、FaceDetector 降级与几何推导
- `services/semantic-analyzer.ts`：浏览器端 VLM adapter、响应校验与本地 Mock fallback
- `services/reference-analyzer.ts`：Geometry + Semantic Fusion、TargetShot 派生
- `services/requirement-planner.ts`：从 `ReferenceAnalysis` 规划 Simple / Standard / Advanced 采集
- `app/api/analyze/route.ts`：DashScope/Qwen、OpenAI、Gemini 服务端代理，structured JSON 与自动 Mock fallback
- `app/api/generate/route.ts`：服务端校验多图生成请求并调用 DashScope `wan2.7-image`
- 当前生成模式固定为完整人物替换：保留场景、镜头和动作，替换脸部、头发、肤色、体型与身体比例，并复刻参考服装。
- 生成请求在检测到人物框时使用 Wan2.7 `bbox_list` 限定完整人物区域，避免退化成仅换脸。
- `DASHSCOPE_IMAGE_BASE_URL` / `DASHSCOPE_IMAGE_API_KEY` 可让图片生成独立使用其他地域；未配置时兼容原有共享变量。
- `components/guided-capture.tsx`：相机引导、自动抓帧和权限回退
- `services/capture-quality.ts`：浏览器端亮度、清晰度与最佳帧选择
- `services/mediapipe-vision.ts`：共享 MediaPipe 模型加载、图片分析与相机 `VIDEO` 模式实时检测

## 检测与隐私边界

- 不可用能力不会填充伪造数值，统一返回 `available=false` 或 `null`。
- MediaPipe WASM 与模型首次分析时从官方/CDN 地址加载，后续由浏览器缓存；检测在浏览器本地执行，图片不会因此上传给 MediaPipe。
- Guided Capture 会等待用户达到目标头部角度并稳定保持后自动抓拍；超时或模型不可用时自动降级为定时抓拍。
- 关键帧评分综合亮度、清晰度、人脸数量/大小、姿态匹配和面部可见度，并按目标角度去重选择。
- VLM 不覆盖真实 CV 产生的 Bounding Box、可见度或后续 Landmarker 头部姿态。
- Demo 不录制或上传整段 Guided Capture 视频，只保留自动抓取的候选关键帧。
- `EphemeralIdentitySession` 只存在于当前页面状态；完成或重置流程时清空，不声称服务器永久删除。
- Generator Adapter 会在浏览器压缩参考素材和身份关键帧，再通过受访问码保护的服务端路由调用 DashScope；真实失败不会回退成 Mock 成功。
- Wan2.7 输入最多 9 张图片，每张不超过 20MB；生成结果 URL 由模型服务临时提供，应及时保存。
- 项目不包含登录、支付、数据库或云端用户资产存储。

