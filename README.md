# Make it me · AI 写真

移动优先的 AI 写真 Web Demo。当前主流程已收缩为：选择原创写真模板、上传一张自拍、通过 Gemini Nano Banana 多图参考生成写真、查看和下载真实结果。旧 Reference Analyzer 与 DashScope 仿拍模块仍保留在代码中，暂不作为首页主流程。

## 本地运行

```bash
npm install
npm run dev
```

复制 `.env.example` 为 `.env.local`。写真主流程需要配置 `GEMINI_API_KEY` 并将私有 Vercel Blob Store 连接到项目；Vercel 部署优先通过项目 OIDC 访问 Blob，本地开发可使用 `BLOB_READ_WRITE_TOKEN`。可通过 `GEMINI_IMAGE_MODEL` 选择图片模型，默认使用 `gemini-3.1-flash-image`。密钥只在服务端读取，不进入浏览器包。

## 写真主流程

- `services/portrait-templates.ts`：45 套 AI 原创写真模板与自拍要求，覆盖职场、韩式、日系、复古、礼服、东方、港风、法式、户外、四季、全球旅拍、超写实个性艺术、男士和常用证件照风格
- `services/portrait-types.ts`：模板、生成请求和真实结果契约
- `app/api/image-upload/route.ts`：将浏览器压缩后的自拍写入 Vercel Blob，只向前端返回图片 URL
- `app/api/portrait-generate/route.ts`：根据 `templateId` 在服务端读取固定写真提示词，自拍是发送给 Gemini 的唯一图片和身份来源；生成结果写入 Blob 后只返回 URL
- `app/page.tsx`：模板选择 → 自拍检查 → 真实生成 → 下载结果
- 自拍在浏览器本地保持原始宽高比缩放至最长边 1600px，使用高质量重采样与不低于 84% 的 JPEG 质量，优先保留人脸细节且不裁切、不拉伸
- 模板图片只用于前端选片预览，不发送给 Gemini，避免模板模特人脸与用户身份发生融合
- 所有模板统一采用“用户自拍 + 模板固定提示词”生成；模板预览图不参与生成，避免任何模板人物身份与用户面部融合
- 浏览器与写真 API 之间不传 Base64：自拍和生成结果均使用私有 Vercel Blob URL；自拍读取后立即删除，成片通过一小时有效的签名应用 URL 展示
- 生成失败会显示真实错误，不会回退成 Mock 成功
- 生成链路记录自拍上传、请求解析、模板/自拍读取、Gemini 生成、结果解析、结果存储、服务端总耗时和浏览器往返耗时；成功页显示耗时明细，Vercel 日志输出 `portrait_generation_timing` 结构化记录
- 当前自拍检查包括格式、文件大小和最低分辨率；人脸数量、遮挡和清晰度评分是下一步增强项

### Gemini 模板预览草稿

- `app/api/admin/template-previews/route.ts` 使用与写真主流程相同的 `GEMINI_IMAGE_MODEL` 和模板 Prompt 生成预览草稿
- 接口只在服务端读取 `GEMINI_API_KEY`，并要求独立的 `TEMPLATE_ADMIN_SECRET` Bearer Token
- 每次最多生成 5 个模板，且请求体必须包含 `confirm: "GENERATE_TEMPLATE_PREVIEWS"`，避免误调用产生费用
- 草稿写入私有 Vercel Blob，不会自动覆盖正式模板；返回的审核链接有效期为 24 小时
- `/admin/templates` 提供管理员工作台，可选择全部模板、每批 5 张连续生成、在线审核、重新生成和发布
- 发布后的正式封面保存在私有 Blob；首页通过 `/api/template-covers` 一次读取封面映射，未发布模板自动回退到 `public/templates`
- `public/baseline-models` 保存虚构男女基准模特自拍；模板生成默认按 `audience` 自动选择，管理员也可强制使用男模或女模
- `services/portrait-prompt.ts` 是模板草稿和用户写真共用的专业摄影 Prompt 编译器，统一约束景别、人物比例、画面位置、裁切、方向、机位、焦段、灯光、环境融合、姿势和商业精修
- 男女非证件照模板统一使用三分法或环境式构图、非对称肩线、身体转角、手部互动和杂志/电影/旅拍叙事，避免生成证件照或员工头像观感
- 模板生成固定使用正面身份照，并根据模板动态追加侧脸、半身或全身基准素材；每张图仅补充角度或比例，避免多图身份融合
- 模板工作台和用户写真页均开放磨皮、美白、祛瑕、瘦脸、大眼、鼻型、皮肤光泽和妆容八项 0–100 独立参数
- 服务端逐项限制美颜效果，避免参数互相放大；证件照强制覆盖为轻度磨皮、提亮和祛瑕，并禁用五官、脸型、发型与明显妆容调整
- 非证件照会根据人物脸型、发际线、头发条件、年龄气质和模板主题匹配发型，并根据肤色、服装色彩和主题匹配背景、色温与空间层次

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
