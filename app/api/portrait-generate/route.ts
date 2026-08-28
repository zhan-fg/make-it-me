import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api-security";
import { getPortraitTemplate } from "@/services/portrait-templates";
import type { PortraitGenerationRequest } from "@/services/portrait-types";

export const runtime = "nodejs";
export const maxDuration = 300;

function imagePart(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label}格式不正确`);
  const match = value.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error(`${label}必须是 JPEG、PNG 或 WebP 图片`);
  if (match[2].length > 14_000_000) throw new Error(`${label}超过 10MB 限制`);
  return { inlineData: { mimeType: match[1].replace("jpg", "jpeg"), data: match[2] } };
}

function prompt(template: NonNullable<ReturnType<typeof getPortraitTemplate>>) {
  return [
    "你是一名专业人像摄影与高端商业修图师。图1是写真模板，图2是用户本人自拍。生成一张全新的、真实摄影质感的竖版写真。",
    `写真方案：${template.prompt}`,
    "必须保持图2用户的身份：脸型骨骼、五官比例、眼睛、鼻子、嘴唇、耳朵与可识别特征。不得复制图1模特的身份。",
    "继承图1的服装设计、妆容方向、发型风格、姿势、构图、景别、机位、灯光、背景与色彩，但根据用户本人自然适配头发和身体比例。",
    "进行自然商业精修：均匀肤色、减弱痘印黑眼圈和泛红、适度磨皮提亮、轻微收紧面颊与下颌；保留真实皮肤纹理，不大眼，不改变鼻子嘴唇，不强行露齿。",
    "头发、脸部、颈部、身体和服装必须属于同一个人，边缘、光线、阴影、景深与背景自然融合；禁止换脸拼贴、双重发型、塑料皮肤、多余人物、文字、水印。",
    "只输出一张最终写真照片。",
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const guard = guardApiRequest(request, "portrait-generate");
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "服务端尚未配置 GEMINI_API_KEY" }, { status: 503 });
    const input = await request.json() as Partial<PortraitGenerationRequest>;
    const template = getPortraitTemplate(String(input.templateId || ""));
    if (!template) return NextResponse.json({ error: "写真模板不存在或已下线" }, { status: 400 });
    const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
    const startedAt = Date.now();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [imagePart(input.templateImage, "模板图片"), imagePart(input.selfieImage, "自拍图片"), { text: prompt(template) }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: template.aspectRatio } },
      }),
      signal: AbortSignal.timeout(285_000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || `Gemini 请求失败（HTTP ${response.status}）`);
    const parts = payload.candidates?.[0]?.content?.parts || [];
    const output = parts.find((part: { inlineData?: { mimeType?: string; data?: string } }) => part.inlineData?.data)?.inlineData;
    if (!output?.data) throw new Error("Gemini 未返回图片，请调整自拍或更换模板重试");
    return NextResponse.json({
      id: `portrait-${Date.now()}`,
      imageUrl: `data:${output.mimeType || "image/png"};base64,${output.data}`,
      provider: "gemini",
      model,
      elapsedMs: Date.now() - startedAt,
      requestId: response.headers.get("x-request-id") || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "写真生成失败";
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({ error: timeout ? "写真生成超时，请稍后重试" : message }, { status: timeout ? 504 : 500 });
  }
}

