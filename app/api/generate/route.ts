import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api-security";
import type { GenerationRequest } from "@/services/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function dashscopeBaseUrl() { return (process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, ""); }
function validateImage(value: unknown, label: string) {
  if (typeof value !== "string" || !/^data:image\/(jpeg|jpg|png|webp|bmp);base64,/i.test(value)) throw new Error(`${label} 必须是本次上传或采集的图片`);
  if (value.length > 27_000_000) throw new Error(`${label} 超过 20MB 限制`);
  return value;
}
function validateInput(value: unknown): GenerationRequest {
  if (!value || typeof value !== "object") throw new Error("生成请求格式不正确");
  const input = value as Partial<GenerationRequest>;
  if (!Array.isArray(input.identityFrames) || input.identityFrames.length < 1) throw new Error("至少需要一张身份关键帧");
  if (input.identityFrames.length > 7) throw new Error("身份关键帧最多 7 张");
  validateImage(input.referenceImage, "参考图");
  input.identityFrames.forEach((frame, index) => validateImage(frame?.image, `身份关键帧 ${index + 1}`));
  if (input.fullBodyImage) validateImage(input.fullBodyImage, "全身参考");
  if (!input.referenceAnalysis || !input.targetShot) throw new Error("缺少镜头分析结果");
  return input as GenerationRequest;
}
function generationPrompt(input: GenerationRequest) {
  const analysis = input.referenceAnalysis;
  return ["生成一张高品质、写实、自然的仿拍照片。", "图1是镜头参考，只保留场景、光线、机位、构图、景别、动作和表情，不保留图1人物身份。",
    `场景：${analysis.scene.summary}。光线：${analysis.scene.lightingContext || "沿用参考图"}。`, `构图：${analysis.shot.composition}；机位：${analysis.shot.cameraAngle}；景别：${analysis.shot.framing}。`,
    `姿态：${analysis.shot.body.poseSummary}；视线：${analysis.shot.face.gaze}；表情：${analysis.shot.face.expression}。`,
    `图2开始是同一目标人物的身份参考，角度依次为：${input.identityFrames.map((frame) => frame.view).join("、")}。必须保持其可辨认的脸型、五官比例与身份一致性。`,
    input.fullBodyImage ? "最后一张是目标人物全身参考，用于身体比例和体态。" : "", `场景还原强度约 ${Math.max(0, Math.min(100, input.intensity))}%。`,
    "保持自然人体结构、真实皮肤纹理和摄影质感；不要拼贴，不要多余人物，不要文字或水印。只输出一张最终照片。"].filter(Boolean).join("\n").slice(0, 5000);
}
async function generateWithWan(input: GenerationRequest) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("服务端尚未配置 DASHSCOPE_API_KEY");
  const model = process.env.DASHSCOPE_IMAGE_MODEL || "wan2.7-image";
  const images = [input.referenceImage, ...input.identityFrames.map((frame) => frame.image), ...(input.fullBodyImage ? [input.fullBodyImage] : [])];
  if (images.length > 9) throw new Error("Wan2.7 最多接受 9 张参考图片");
  const startedAt = Date.now();
  const response = await fetch(`${dashscopeBaseUrl()}/services/aigc/multimodal-generation/generation`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: { messages: [{ role: "user", content: [...images.map((image) => ({ image })), { text: generationPrompt(input) }] }] }, parameters: { size: process.env.DASHSCOPE_IMAGE_SIZE || "2K", n: 1, watermark: false, thinking_mode: true } }), signal: AbortSignal.timeout(240_000) });
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

