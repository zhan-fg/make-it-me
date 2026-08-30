import { NextResponse } from "next/server";
import { del, get, put } from "@vercel/blob";
import { createHmac } from "node:crypto";
import { guardApiRequest } from "@/lib/api-security";
import { buildPortraitPrompt } from "@/services/portrait-prompt";
import { getPortraitTemplate } from "@/services/portrait-templates";
import type { PortraitGenerationRequest } from "@/services/portrait-types";

export const runtime = "nodejs";
export const maxDuration = 300;

async function imagePartFromBlobUrl(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label}地址格式不正确`);
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".private.blob.vercel-storage.com")) throw new Error(`${label}必须来自本应用的私有图片存储`);
  const blob = await get(url.toString(), { access: "private", abortSignal: AbortSignal.timeout(20_000) });
  if (!blob || blob.statusCode !== 200) throw new Error(`${label}读取失败`);
  const mimeType = blob.blob.contentType?.split(";")[0].toLowerCase();
  if (!mimeType || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error(`${label}必须是 JPEG、PNG 或 WebP 图片`);
  const data = Buffer.from(await new Response(blob.stream).arrayBuffer());
  if (data.byteLength > 2_200_000) throw new Error(`${label}超过上传限制`);
  return { inlineData: { mimeType, data: data.toString("base64") } };
}

function signedResultUrl(request: Request, blobUrl: string, secret: string) {
  const expires = Date.now() + 60 * 60 * 1000;
  const value = `${blobUrl}\n${expires}`;
  const signature = createHmac("sha256", secret).update(value).digest("hex");
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
    const requestParseStartedAt = performance.now();
    const input = await request.json() as Partial<PortraitGenerationRequest>;
    requestParseMs = performance.now() - requestParseStartedAt;
    templateId = String(input.templateId || "");
    const template = getPortraitTemplate(templateId);
    if (!template) return NextResponse.json({ error: "写真模板不存在或已下线" }, { status: 400 });
    const templateLoadStartedAt = performance.now();
    const selfiePart = await imagePartFromBlobUrl(input.selfieImageUrl, "自拍图片");
    templateLoadMs = performance.now() - templateLoadStartedAt;
    if (typeof input.selfieImageUrl === "string") await del(input.selfieImageUrl).catch(() => undefined);
    const geminiStartedAt = performance.now();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [selfiePart, { text: buildPortraitPrompt(template, "user", { beautyLevel: input.beautyLevel }) }] }],
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
      imageUrl: signedResultUrl(request, generatedImage.url, apiKey),
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
