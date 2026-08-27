import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api-security";
import type { GenerationRequest } from "@/services/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function dashscopeBaseUrl() { return (process.env.DASHSCOPE_IMAGE_BASE_URL || process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, ""); }
function validateImage(value: unknown, label: string) {
  if (typeof value !== "string" || !/^data:image\/(jpeg|jpg|png|webp|bmp);base64,/i.test(value)) throw new Error(`${label} 必须是本次上传或采集的图片`);
  if (value.length > 27_000_000) throw new Error(`${label} 超过 20MB 限制`);
  return value;
}
function validateInput(value: unknown): GenerationRequest {
  if (!value || typeof value !== "object") throw new Error("生成请求格式不正确");
  const input = value as Partial<GenerationRequest>;
  if (input.replacementMode !== "full_person") throw new Error("当前版本仅支持完整人物替换");
  if (!Array.isArray(input.identityFrames) || input.identityFrames.length < 1) throw new Error("至少需要一张身份关键帧");
  if (input.identityFrames.length > 7) throw new Error("身份关键帧最多 7 张");
  validateImage(input.referenceImage, "参考图");
  input.identityFrames.forEach((frame, index) => validateImage(frame?.image, `身份关键帧 ${index + 1}`));
  if (input.fullBodyImage) validateImage(input.fullBodyImage, "全身参考");
  if (!input.referenceAnalysis || !input.targetShot) throw new Error("缺少镜头分析结果");
  if (!input.expressionPolicy) throw new Error("缺少表情生成策略");
  if (!input.referenceSize || input.referenceSize.width < 1 || input.referenceSize.height < 1) throw new Error("缺少参考图尺寸");
  if (["three_quarter", "full_body"].includes(input.referenceAnalysis.shot.body.coverage) && !input.fullBodyImage) throw new Error("中远景或全身镜头需要用户全身参考");
  return input as GenerationRequest;
}
function personBoundingBox(input: GenerationRequest) {
  const person = input.referenceAnalysis.geometry.personBoundingBox || input.referenceAnalysis.scene.subjectRegion;
  const face = input.referenceAnalysis.geometry.faceBoundingBox;
  if (!person && !face) return undefined;
  const hairRegion = face ? {
    x: face.x - face.width * .8,
    y: face.y - face.height * 1.25,
    width: face.width * 2.6,
    height: face.height * 4.1,
  } : undefined;
  const regions = [person, hairRegion].filter((region): region is NonNullable<typeof region> => Boolean(region));
  const left = Math.min(...regions.map((region) => region.x));
  const top = Math.min(...regions.map((region) => region.y));
  const right = Math.max(...regions.map((region) => region.x + region.width));
  const bottom = Math.max(...regions.map((region) => region.y + region.height));
  const width = right - left; const height = bottom - top;
  const paddingX = Math.max(width * .1, face?.width ? face.width * .35 : 0);
  const paddingTop = Math.max(height * .05, face?.height ? face.height * .35 : 0);
  const paddingBottom = height * .08;
  const x1 = Math.max(0, Math.floor((left - paddingX) * input.referenceSize.width));
  const y1 = Math.max(0, Math.floor((top - paddingTop) * input.referenceSize.height));
  const x2 = Math.min(input.referenceSize.width, Math.ceil((right + paddingX) * input.referenceSize.width));
  const y2 = Math.min(input.referenceSize.height, Math.ceil((bottom + paddingBottom) * input.referenceSize.height));
  return x2 > x1 && y2 > y1 ? [x1, y1, x2, y2] : undefined;
}
function generationPrompt(input: GenerationRequest) {
  const analysis = input.referenceAnalysis;
  const expressionRule = input.expressionPolicy.mouthState === "teeth_visible" && input.expressionPolicy.hasMatchingExpressionFrame
    ? "可以参考专门采集的露齿表情帧生成自然、克制的露齿微笑；保持目标人物真实唇形、牙齿比例和嘴角幅度，不要夸张笑容。"
    : "不要生成或露出牙齿。只保留参考图的整体情绪语气，使用自然闭嘴或极轻微微笑；不得强行复刻原人物的嘴型、牙齿、嘴角幅度或面部肌肉。";
  return ["执行完整人物替换，生成一张高品质、写实、自然的仿拍照片。", "图1是镜头和环境参考。保留框外背景、光线、机位、构图、景别，以及框内人物的姿态、视线、表情和互动关系；彻底移除图1原人物的身份与身体外观。",
    `场景：${analysis.scene.summary}。光线：${analysis.scene.lightingContext || "沿用参考图"}。`, `构图：${analysis.shot.composition}；机位：${analysis.shot.cameraAngle}；景别：${analysis.shot.framing}。`,
    `姿态：${analysis.shot.body.poseSummary}；视线：${input.expressionPolicy.targetGaze}；参考情绪：${input.expressionPolicy.targetExpression}。${expressionRule}`,
    `图2开始是同一目标人物的头肩身份参考，角度依次为：${input.identityFrames.map((frame) => frame.view).join("、")}。使用目标人物的完整头部身份：脸型、五官比例、眼睛、鼻子、嘴、耳朵、发际线、发型、发色、颈部与肤色。`,
    input.fullBodyImage ? "最后一张是目标人物全身参考。使用其真实体型、肩宽、身体比例和整体轮廓，同时复刻图1服装的款式、颜色与穿着关系。" : "根据头肩参考自然重建目标人物的肩颈与身体，不得沿用图1原人物的头发、肤色、体型或身体特征。",
    "重点保证头发与脸部属于同一目标人物，发际线自然，耳朵和脸颈肤色连续，头部光线与场景一致，严禁仅换脸或把目标人物的脸贴到图1原人物身体上。",
    "完整清除图1原人物的全部头发、发色、发型轮廓、头顶碎发、鬓角、耳后发丝、肩部发梢和背部长发，不得出现双重发型、重影、残留发丝或两种发色。使用身份参考中目标人物的头发重新生成整个头部轮廓，并让发丝边缘与背景自然融合。",
    `场景还原强度约 ${Math.max(0, Math.min(100, input.intensity))}%。`, "保持自然人体结构、真实皮肤纹理和摄影质感；不要拼贴，不要多余人物，不要文字或水印。只输出一张最终照片。"].filter(Boolean).join("\n").slice(0, 5000);
}
async function generateWithWan(input: GenerationRequest) {
  const apiKey = process.env.DASHSCOPE_IMAGE_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("服务端尚未配置 DASHSCOPE_IMAGE_API_KEY 或 DASHSCOPE_API_KEY");
  const model = process.env.DASHSCOPE_IMAGE_MODEL || "wan2.7-image";
  const images = [input.referenceImage, ...input.identityFrames.map((frame) => frame.image), ...(input.fullBodyImage ? [input.fullBodyImage] : [])];
  if (images.length > 9) throw new Error("Wan2.7 最多接受 9 张参考图片");
  const startedAt = Date.now();
  const targetBox = personBoundingBox(input);
  const parameters = { size: process.env.DASHSCOPE_IMAGE_SIZE || "2K", n: 1, watermark: false, thinking_mode: true, ...(targetBox ? { bbox_list: [[targetBox], ...images.slice(1).map(() => [])] } : {}) };
  const response = await fetch(`${dashscopeBaseUrl()}/services/aigc/multimodal-generation/generation`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: { messages: [{ role: "user", content: [...images.map((image) => ({ image })), { text: generationPrompt(input) }] }] }, parameters }), signal: AbortSignal.timeout(240_000) });
  const text = await response.text(); let payload: any;
  try { payload = JSON.parse(text); } catch { throw new Error(`DashScope 返回非 JSON 响应（HTTP ${response.status}）`); }
  if (!response.ok) throw new Error(payload.message || payload.code || "Wan2.7 图片生成失败");
  const imageUrl = (payload.output?.choices?.[0]?.message?.content || []).find((item: { image?: string }) => item.image)?.image;
  if (!imageUrl) throw new Error("Wan2.7 未返回生成图片");
  return { id: payload.request_id || `dashscope-${Date.now()}`, imageUrl, provider: "dashscope" as const, model, elapsedMs: Date.now() - startedAt, requestId: payload.request_id };
}
export async function POST(request: Request) {
  try {
    const guard = guardApiRequest(request, "generate"); if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const provider = (process.env.AI_PROVIDER || "dashscope").toLowerCase();
    if (!["dashscope", "qwen", "aliyun", "wanx"].includes(provider)) return NextResponse.json({ error: `当前图片生成仅支持 DashScope，AI_PROVIDER=${provider}` }, { status: 503 });
    return NextResponse.json(await generateWithWan(validateInput(await request.json())));
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败";
    return NextResponse.json({ error: message }, { status: message.includes("超时") ? 504 : message.includes("必须") || message.includes("缺少") || message.includes("最多") ? 400 : 500 });
  }
}

