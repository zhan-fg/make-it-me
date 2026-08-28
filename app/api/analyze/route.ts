import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api-security";
import type { BodyOrientation, SemanticAnalysis } from "@/services/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type SemanticPayload = Omit<SemanticAnalysis, "provider" | "warnings">;
type AnalyzerProvider = SemanticAnalysis["provider"];

const bodyOrientations: BodyOrientation[] = ["front", "side", "back_three_quarter", "back"];
const semanticSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    scene: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        preserveRecommended: { type: "boolean" },
        backgroundRegion: { type: "string" },
        lightingContext: { type: "string" },
      },
      required: ["summary", "preserveRecommended", "backgroundRegion", "lightingContext"],
    },
    shot: {
      type: "object",
      additionalProperties: false,
      properties: {
        subjectPosition: { type: "string" },
        composition: { type: "string" },
        cameraAngle: { type: "string" },
        framing: { type: "string" },
        gaze: { type: "string" },
        expression: { type: "string" },
        poseSummary: { type: "string" },
        bodyOrientation: { type: "string", enum: bodyOrientations },
        interaction: { type: "string" },
      },
      required: ["subjectPosition", "composition", "cameraAngle", "framing", "gaze", "expression", "poseSummary", "bodyOrientation", "interaction"],
    },
    appearance: {
      type: "object",
      additionalProperties: false,
      properties: {
        outfit: { type: "string" },
        hair: { type: "string" },
        makeup: { type: "string" },
        accessories: { type: "string" },
      },
      required: ["outfit", "hair", "makeup", "accessories"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["scene", "shot", "appearance", "confidence"],
};

const prompt = `你是 Reference Semantic Analyzer。只分析摄影语义，不识别人物身份。用简洁中文输出场景摘要、是否建议保留原场景、背景区域、光线、人物位置、构图、机位、景别、视线、表情、姿势、身体朝向、互动，以及可选的服装/发型/妆容/配饰。不能可靠判断时使用“未识别”或空字符串。confidence 为 0 到 1。只输出符合 schema 的 JSON。`;

function mockAnalysis(warning: string): SemanticAnalysis {
  return {
    scene: { summary: "参考场景（Mock 语义分析）", preserveRecommended: true, backgroundRegion: "原始背景", lightingContext: "未识别" },
    shot: { subjectPosition: "人物位置待确认", composition: "人物构图", cameraAngle: "平视", framing: "半身", gaze: "自然看向镜头", expression: "自然表情", poseSummary: "人物姿态待确认", bodyOrientation: "front" },
    appearance: {},
    confidence: 0.35,
    provider: "mock",
    warnings: ["Mock semantic analysis", warning],
  };
}

function parseJson(text: string) {
  return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim()) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validatePayload(value: unknown): { data?: SemanticPayload; warning?: string } {
  if (!isRecord(value) || !isRecord(value.scene) || !isRecord(value.shot) || !isRecord(value.appearance)) return { warning: "VLM 返回结构缺少 scene、shot 或 appearance" };
  const scene = value.scene;
  const shot = value.shot;
  const appearance = value.appearance;
  const requiredStrings = [scene.summary, shot.subjectPosition, shot.composition, shot.cameraAngle, shot.framing, shot.gaze, shot.expression, shot.poseSummary];
  if (requiredStrings.some((item) => typeof item !== "string") || typeof scene.preserveRecommended !== "boolean") return { warning: "VLM 返回字段类型不符合 schema" };
  if (!bodyOrientations.includes(shot.bodyOrientation as BodyOrientation)) return { warning: "VLM 返回了无效的 bodyOrientation" };
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : undefined;
  if (confidence === undefined) return { warning: "VLM 未返回有效 confidence" };
  return {
    data: {
      scene: {
        summary: String(scene.summary).trim(),
        preserveRecommended: scene.preserveRecommended,
        backgroundRegion: optionalString(scene.backgroundRegion),
        lightingContext: optionalString(scene.lightingContext),
      },
      shot: {
        subjectPosition: String(shot.subjectPosition).trim(),
        composition: String(shot.composition).trim(),
        cameraAngle: String(shot.cameraAngle).trim(),
        framing: String(shot.framing).trim(),
        gaze: String(shot.gaze).trim(),
        expression: String(shot.expression).trim(),
        poseSummary: String(shot.poseSummary).trim(),
        bodyOrientation: shot.bodyOrientation as BodyOrientation,
        interaction: optionalString(shot.interaction),
      },
      appearance: {
        outfit: optionalString(appearance.outfit),
        hair: optionalString(appearance.hair),
        makeup: optionalString(appearance.makeup),
        accessories: optionalString(appearance.accessories),
      },
      confidence,
    },
  };
}

async function analyzeWithOpenAI(image: string): Promise<SemanticPayload> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_ANALYZER_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: image }] }],
      text: { format: { type: "json_schema", name: "reference_semantic_analysis", strict: true, schema: semanticSchema } },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "OpenAI 语义分析失败");
  const text = payload.output_text || payload.output?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content || []).map((item: { text?: string }) => item.text || "").join("");
  if (!text) throw new Error("OpenAI 未返回语义分析结果");
  const validated = validatePayload(parseJson(text));
  if (!validated.data) throw new Error(validated.warning || "OpenAI 返回未通过 schema 校验");
  return validated.data;
}

async function analyzeWithGemini(image: string): Promise<SemanticPayload> {
  const match = image.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Gemini 只接受 base64 图片代表帧");
  const model = process.env.GEMINI_ANALYZER_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: match[1], data: match[2] } }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: semanticSchema },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "Gemini 语义分析失败");
  const text = payload.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
  if (!text) throw new Error("Gemini 未返回语义分析结果");
  const validated = validatePayload(parseJson(text));
  if (!validated.data) throw new Error(validated.warning || "Gemini 返回未通过 schema 校验");
  return validated.data;
}

function dashscopeBaseUrl() {
  return (process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, "");
}

function dashscopeText(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.output) || !Array.isArray(payload.output.choices)) return undefined;
  const firstChoice = payload.output.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return undefined;
  const content = firstChoice.message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content.map((item) => isRecord(item) && typeof item.text === "string" ? item.text : "").join("");
}

async function analyzeWithDashScope(image: string): Promise<SemanticPayload> {
  const dashscopePrompt = `${prompt}\n严格按照以下 JSON Schema 的字段名和类型输出：\n${JSON.stringify(semanticSchema)}`;
  const response = await fetch(`${dashscopeBaseUrl()}/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.DASHSCOPE_ANALYZER_MODEL || "qwen-vl-max",
      input: {
        messages: [{ role: "user", content: [{ image }, { text: dashscopePrompt }] }],
      },
      parameters: {
        result_format: "message",
        response_format: { type: "json_object" },
        temperature: 0.1,
      },
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.message === "string" ? payload.message : "DashScope 语义分析失败";
    throw new Error(message);
  }
  const text = dashscopeText(payload);
  if (!text) throw new Error("DashScope 未返回语义分析结果");
  const validated = validatePayload(parseJson(text));
  if (!validated.data) throw new Error(validated.warning || "DashScope 返回未通过 schema 校验");
  return validated.data;
}

function configuredProvider(): AnalyzerProvider {
  const explicit = process.env.ANALYZER_PROVIDER?.toLowerCase();
  const configured = explicit || process.env.AI_PROVIDER?.toLowerCase();
  if (["dashscope", "qwen", "aliyun", "wanx"].includes(configured || "")) return "dashscope";
  if (configured === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (configured === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (!explicit && process.env.DASHSCOPE_API_KEY) return "dashscope";
  if (configured === "openai" || configured === "gemini" || configured === "mock") return configured;
  return "mock";
}

export async function POST(request: Request) {
  try {
    const configured = (process.env.ANALYZER_PROVIDER || process.env.AI_PROVIDER || "auto").toLowerCase();
    const provider = configuredProvider();
    const hasRemoteProvider =
      (provider === "dashscope" && Boolean(process.env.DASHSCOPE_API_KEY)) ||
      (provider === "openai" && Boolean(process.env.OPENAI_API_KEY)) ||
      (provider === "gemini" && Boolean(process.env.GEMINI_API_KEY));
    if (hasRemoteProvider) {
      const guard = guardApiRequest(request, "analyze");
      if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json();
    const image = body?.image;
    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) return NextResponse.json({ error: "请上传本地图片或视频代表帧" }, { status: 400 });

    if (provider === "dashscope" && !process.env.DASHSCOPE_API_KEY) return NextResponse.json(mockAnalysis("未配置 DASHSCOPE_API_KEY，已自动回退"));
    if (provider === "openai" && !process.env.OPENAI_API_KEY) return NextResponse.json(mockAnalysis("未配置 OPENAI_API_KEY，已自动回退"));
    if (provider === "gemini" && !process.env.GEMINI_API_KEY) return NextResponse.json(mockAnalysis("未配置 GEMINI_API_KEY，已自动回退"));
    if (provider === "mock") return NextResponse.json(mockAnalysis(configured === "mock" ? "Analyzer provider=mock" : `没有可用的 Analyzer provider: ${configured}`));

    const data = provider === "dashscope"
      ? await analyzeWithDashScope(image)
      : provider === "openai"
        ? await analyzeWithOpenAI(image)
        : await analyzeWithGemini(image);
    return NextResponse.json({ ...data, provider, warnings: [] } satisfies SemanticAnalysis);
  } catch (error) {
    return NextResponse.json(mockAnalysis(error instanceof Error ? error.message : "语义分析失败，已自动回退"));
  }
}

