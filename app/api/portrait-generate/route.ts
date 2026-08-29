import { NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { guardApiRequest } from "@/lib/api-security";
import { getPortraitTemplate } from "@/services/portrait-templates";
import type { PortraitGenerationRequest } from "@/services/portrait-types";

export const runtime = "nodejs";
export const maxDuration = 300;

async function imagePartFromBlobUrl(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label}地址格式不正确`);
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".private.blob.vercel-storage.com")) throw new Error(`${label}必须来自本应用的私有图片存储`);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${label}读取失败（HTTP ${response.status}）`);
  const mimeType = response.headers.get("content-type")?.split(";")[0].toLowerCase();
  if (!mimeType || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error(`${label}必须是 JPEG、PNG 或 WebP 图片`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength > 2_200_000) throw new Error(`${label}超过上传限制`);
  return { inlineData: { mimeType, data: data.toString("base64") } };
}

async function templateImagePart(coverImage: string) {
  const relativePath = coverImage.replace(/^\/+/, "");
  const absolutePath = path.join(process.cwd(), "public", relativePath.replace(/^templates\//, "templates/"));
  const publicRoot = path.resolve(process.cwd(), "public");
  if (!path.resolve(absolutePath).startsWith(`${publicRoot}${path.sep}`)) throw new Error("写真模板路径不正确");
  const data = await readFile(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return { inlineData: { mimeType, data: data.toString("base64") } };
}

function prompt(template: NonNullable<ReturnType<typeof getPortraitTemplate>>) {
  const appearanceRule = template.category === "id_photo"
    ? "这是证件照任务：必须原样保留图2用户本人的脸型、面部骨骼、五官比例、发型、发际线、头发长度与真实身份，仅按图1规范服装、纯色背景、正面机位、头肩比例与均匀光线；不得瘦脸、改变脸型、改变发型、增加发量、添加明显妆容或制造写真姿势。"
    : "继承图1的服装设计、妆容方向、发型风格、姿势、构图、景别、机位、灯光、背景与色彩，但根据用户本人自然适配头发和身体比例。";
  const retouchRule = template.category === "id_photo"
    ? "证件照只允许轻微磨皮和轻微均匀肤色，保留皮肤纹理、痣、面部轮廓与本人真实特征；不得去除全部皮肤细节，不得美白过度，不得瘦脸、大眼或改变脸型、发型、眼睛、鼻子、嘴唇和表情。"
    : "进行自然商业精修：均匀肤色、去除痘印黑眼圈和泛红、适度磨皮提亮、增加皮肤光泽感、轻微收紧面颊与下颌；保留真实皮肤纹理，不大眼，不改变鼻子嘴唇，不强行露齿。";
  return [
    "你是一名专业人像摄影与高端商业修图师。图1是写真模板，图2是用户本人自拍。生成一张全新的、真实摄影质感的竖版写真。",
    `写真方案：${template.prompt}`,
    "成片必须是超写实真人摄影：呈现真实皮肤毛孔与细微纹理、独立自然发丝、准确人体结构、真实布料与材质、符合物理规律的光影和全画幅相机镜头质感；禁止插画感、CG 感、游戏建模感、蜡像感和塑料皮肤。",
    "必须保持图2用户的身份：脸型骨骼、五官比例、眼睛、鼻子、嘴唇、耳朵与可识别特征。不得复制图1模特的身份。",
    appearanceRule,
    retouchRule,
    "头发、脸部、颈部、身体和服装必须属于同一个人，边缘、光线、阴影、景深与背景自然融合；禁止换脸拼贴、双重发型、塑料皮肤、多余人物、文字、水印。",
    "只输出一张最终写真照片。",
  ].join("\n");
}

function signedResultUrl(request: Request, blobUrl: string) {
  const expires = Date.now() + 60 * 60 * 1000;
  const value = `${blobUrl}\n${expires}`;
  const signature = createHmac("sha256", process.env.BLOB_READ_WRITE_TOKEN!).update(value).digest("hex");
  const url = new URL("/api/portrait-image", request.url);
  url.searchParams.set("url", blobUrl);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);
  return url.toString();
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now();
  const requestId = crypto.randomUUID();
  let requestParseMs = 0;
  let templateLoadMs = 0;
  let geminiMs = 0;
  let responseParseMs = 0;
  let resultStorageMs = 0;
  let templateId = "unknown";
  let model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
  try {
    const guard = guardApiRequest(request, "portrait-generate");
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "服务端尚未配置 GEMINI_API_KEY" }, { status: 503 });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "服务端尚未配置 BLOB_READ_WRITE_TOKEN" }, { status: 503 });
    const requestParseStartedAt = performance.now();
    const input = await request.json() as Partial<PortraitGenerationRequest>;
    requestParseMs = performance.now() - requestParseStartedAt;
    templateId = String(input.templateId || "");
    const template = getPortraitTemplate(templateId);
    if (!template) return NextResponse.json({ error: "写真模板不存在或已下线" }, { status: 400 });
    const templateLoadStartedAt = performance.now();
    const [templatePart, selfiePart] = await Promise.all([templateImagePart(template.coverImage), imagePartFromBlobUrl(input.selfieImageUrl, "自拍图片")]);
    templateLoadMs = performance.now() - templateLoadStartedAt;
    if (typeof input.selfieImageUrl === "string") await del(input.selfieImageUrl).catch(() => undefined);
    const geminiStartedAt = performance.now();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [templatePart, selfiePart, { text: prompt(template) }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: template.aspectRatio } },
      }),
      signal: AbortSignal.timeout(285_000),
    });
    geminiMs = performance.now() - geminiStartedAt;
    const responseParseStartedAt = performance.now();
    const payload = await response.json();
    responseParseMs = performance.now() - responseParseStartedAt;
    if (!response.ok) throw new Error(payload.error?.message || `Gemini 请求失败（HTTP ${response.status}）`);
    const parts = payload.candidates?.[0]?.content?.parts || [];
    const output = parts.find((part: { inlineData?: { mimeType?: string; data?: string } }) => part.inlineData?.data)?.inlineData;
    if (!output?.data) throw new Error("Gemini 未返回图片，请调整自拍或更换模板重试");
    const outputMimeType = ["image/jpeg", "image/png", "image/webp"].includes(output.mimeType || "") ? output.mimeType! : "image/png";
    const extension = outputMimeType === "image/jpeg" ? "jpg" : outputMimeType === "image/webp" ? "webp" : "png";
    const resultStorageStartedAt = performance.now();
    const generatedImage = await put(`portraits/${requestId}.${extension}`, Buffer.from(output.data, "base64"), { access: "private", addRandomSuffix: true, contentType: outputMimeType });
    resultStorageMs = performance.now() - resultStorageStartedAt;
    const serverTotalMs = performance.now() - requestStartedAt;
    const timings = { requestParseMs, templateLoadMs, geminiMs, responseParseMs, resultStorageMs, serverTotalMs };
    const providerRequestId = response.headers.get("x-request-id") || undefined;
    console.info("portrait_generation_timing", JSON.stringify({ requestId, providerRequestId, templateId, model, status: "success", ...timings }));
    return NextResponse.json({
      id: `portrait-${Date.now()}`,
      imageUrl: signedResultUrl(request, generatedImage.url),
      provider: "gemini",
      model,
      elapsedMs: Math.round(serverTotalMs),
      timings,
      requestId,
      providerRequestId,
    }, { headers: { "Server-Timing": `parse;dur=${requestParseMs.toFixed(1)}, template;dur=${templateLoadMs.toFixed(1)}, gemini;dur=${geminiMs.toFixed(1)}, response;dur=${responseParseMs.toFixed(1)}, storage;dur=${resultStorageMs.toFixed(1)}, total;dur=${serverTotalMs.toFixed(1)}` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "写真生成失败";
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const serverTotalMs = performance.now() - requestStartedAt;
    const timings = { requestParseMs, templateLoadMs, geminiMs, responseParseMs, resultStorageMs, serverTotalMs };
    console.error("portrait_generation_timing", JSON.stringify({ requestId, templateId, model, status: timeout ? "timeout" : "error", error: message, ...timings }));
    return NextResponse.json({ error: timeout ? "写真生成超时，请稍后重试" : message, requestId, timings }, { status: timeout ? 504 : 500, headers: { "Server-Timing": `parse;dur=${requestParseMs.toFixed(1)}, template;dur=${templateLoadMs.toFixed(1)}, gemini;dur=${geminiMs.toFixed(1)}, response;dur=${responseParseMs.toFixed(1)}, storage;dur=${resultStorageMs.toFixed(1)}, total;dur=${serverTotalMs.toFixed(1)}` } });
  }
}

