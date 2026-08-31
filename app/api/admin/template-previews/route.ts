import { del, get, list, put } from "@vercel/blob";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { buildPortraitPrompt } from "@/services/portrait-prompt";
import { getPortraitTemplate } from "@/services/portrait-templates";
import type { PortraitRetouchSettings } from "@/services/portrait-types";
import { baselineGenderForTemplate, baselineViewLabels, normalizeBaselineViews, recommendedBaselineViews, type BaselineGender, type BaselineView } from "@/services/portrait-reference-selection";

export const runtime = "nodejs";
export const maxDuration = 300;

const confirmation = "GENERATE_TEMPLATE_PREVIEWS";

function authorized(request: Request, secret: string) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expected = Buffer.from(secret);
  const received = Buffer.from(token);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function baselineModelPart(gender: BaselineGender, view: BaselineView) {
  const file = path.join(process.cwd(), "public", "baseline-models", `${gender}-${view}.jpg`);
  const data = await readFile(file);
  return { inlineData: { mimeType: "image/jpeg", data: data.toString("base64") } };
}

async function baselineModelParts(gender: BaselineGender, views: BaselineView[]) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: "以下照片全部属于同一个虚构基准模特。每张照片只补充对应角度或身体比例，不得创建、平均或融合新的脸。" }];
  for (const view of views) parts.push({ text: baselineViewLabels[view] }, await baselineModelPart(gender, view));
  return { views, parts };
}

function signedPreviewUrl(request: Request, blobUrl: string, secret: string) {
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  const signature = createHmac("sha256", secret).update(`${blobUrl}\n${expires}`).digest("hex");
  const url = new URL("/api/portrait-image", request.url);
  url.searchParams.set("url", blobUrl);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);
  return url.toString();
}

export async function POST(request: Request) {
  const adminSecret = process.env.TEMPLATE_ADMIN_SECRET;
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
  if (!adminSecret) return NextResponse.json({ error: "服务端尚未配置 TEMPLATE_ADMIN_SECRET" }, { status: 503 });
  if (!authorized(request, adminSecret)) return NextResponse.json({ error: "无权生成模板草稿" }, { status: 401 });
  if (!apiKey) return NextResponse.json({ error: "服务端尚未配置 GEMINI_API_KEY" }, { status: 503 });

  try {
    const input = await request.json() as { templateIds?: unknown; confirm?: unknown; baselineGender?: unknown; baselineViews?: unknown; retouchSettings?: unknown };
    if (input.confirm !== confirmation) return NextResponse.json({ error: `请传入 confirm: ${confirmation}` }, { status: 400 });
    if (!Array.isArray(input.templateIds)) return NextResponse.json({ error: "templateIds 必须是数组" }, { status: 400 });
    const templateIds = [...new Set(input.templateIds.filter((value): value is string => typeof value === "string"))];
    if (!templateIds.length || templateIds.length > 5) return NextResponse.json({ error: "每次请选择 1 至 5 个模板" }, { status: 400 });

    const results = await Promise.all(templateIds.map(async (templateId) => {
      const template = getPortraitTemplate(templateId);
      if (!template) {
        return { templateId, status: "error" as const, error: "模板不存在" };
      }
      const startedAt = performance.now();
      try {
        const forcedGender = input.baselineGender === "female" || input.baselineGender === "male" ? input.baselineGender : undefined;
        const baselineGender = forcedGender || baselineGenderForTemplate(template);
        const baselineViews = normalizeBaselineViews(input.baselineViews, recommendedBaselineViews(template));
        const retouchSettings = input.retouchSettings && typeof input.retouchSettings === "object" ? input.retouchSettings as PortraitRetouchSettings : undefined;
        const baseline = await baselineModelParts(baselineGender, baselineViews);
        const generationPrompt = buildPortraitPrompt(template, "template", { retouchSettings, identityReferenceCount: baseline.views.length });
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [...baseline.parts, { text: generationPrompt }] }],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: template.aspectRatio } },
          }),
          signal: AbortSignal.timeout(110_000),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || `Gemini 请求失败（HTTP ${response.status}）`);
        const parts = payload.candidates?.[0]?.content?.parts || [];
        const output = parts.find((part: { inlineData?: { mimeType?: string; data?: string } }) => part.inlineData?.data)?.inlineData;
        if (!output?.data) throw new Error("Gemini 未返回模板图片");
        const mimeType = ["image/jpeg", "image/png", "image/webp"].includes(output.mimeType || "") ? output.mimeType! : "image/png";
        const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
        const blob = await put(`template-preview-drafts/${template.id}/${crypto.randomUUID()}.${extension}`, Buffer.from(output.data, "base64"), {
          access: "private",
          addRandomSuffix: true,
          contentType: mimeType,
        });
        return {
          templateId,
          title: template.title,
          status: "success" as const,
          imageUrl: signedPreviewUrl(request, blob.url, apiKey),
          blobUrl: blob.url,
          baselineGender,
          baselineViews: baseline.views,
          retouchSettings,
          model,
          prompt: generationPrompt,
          elapsedMs: Math.round(performance.now() - startedAt),
          providerRequestId: response.headers.get("x-request-id") || undefined,
        };
      } catch (error) {
        return { templateId, title: template.title, status: "error" as const, error: error instanceof Error ? error.message : "模板生成失败" };
      }
    }));

    console.info("template_preview_generation", JSON.stringify({ model, templateIds, results: results.map((result) => ({ templateId: result.templateId, status: result.status, elapsedMs: "elapsedMs" in result ? result.elapsedMs : undefined })) }));
    return NextResponse.json({ model, draftsOnly: true, expiresInHours: 24, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "模板生成请求失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const adminSecret = process.env.TEMPLATE_ADMIN_SECRET;
  if (!adminSecret) return NextResponse.json({ error: "服务端尚未配置 TEMPLATE_ADMIN_SECRET" }, { status: 503 });
  if (!authorized(request, adminSecret)) return NextResponse.json({ error: "无权发布模板" }, { status: 401 });

  try {
    const input = await request.json() as { templateId?: unknown; blobUrl?: unknown; confirm?: unknown };
    const templateId = typeof input.templateId === "string" ? input.templateId : "";
    const template = getPortraitTemplate(templateId);
    if (!template) return NextResponse.json({ error: "模板不存在" }, { status: 400 });
    if (input.confirm !== "PUBLISH_TEMPLATE_PREVIEW") return NextResponse.json({ error: "缺少发布确认" }, { status: 400 });
    if (typeof input.blobUrl !== "string") return NextResponse.json({ error: "草稿地址无效" }, { status: 400 });
    const sourceUrl = new URL(input.blobUrl);
    const expectedPrefix = `/template-preview-drafts/${templateId}/`;
    if (sourceUrl.protocol !== "https:" || !sourceUrl.hostname.endsWith(".private.blob.vercel-storage.com") || !decodeURIComponent(sourceUrl.pathname).startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "只能发布该模板自己的私有草稿" }, { status: 400 });
    }
    const source = await get(sourceUrl.toString(), { access: "private", abortSignal: AbortSignal.timeout(20_000) });
    if (!source || source.statusCode !== 200) return NextResponse.json({ error: "草稿图片不存在或已失效" }, { status: 404 });
    const mimeType = source.blob.contentType?.split(";")[0] || "image/jpeg";
    const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const image = Buffer.from(await new Response(source.stream).arrayBuffer());
    const published = await put(`template-published/${templateId}/${Date.now()}-${crypto.randomUUID()}.${extension}`, image, {
      access: "private",
      addRandomSuffix: true,
      contentType: mimeType,
    });
    const previous = await list({ prefix: `template-published/${templateId}/`, limit: 100 });
    const obsolete = previous.blobs.filter((blob) => blob.url !== published.url).map((blob) => blob.url);
    if (obsolete.length) await del(obsolete).catch(() => undefined);
    console.info("template_preview_published", JSON.stringify({ templateId, blobUrl: published.url }));
    return NextResponse.json({ templateId, status: "published", publishedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "模板发布失败" }, { status: 500 });
  }
}
