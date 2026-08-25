import { NextResponse } from "next/server";

export const runtime = "nodejs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    scene: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        detail: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["title", "detail", "confidence"],
    },
    shot: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { label: { type: "string" }, value: { type: "string" } },
        required: ["label", "value"],
      },
    },
  },
  required: ["scene", "shot"],
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "服务端尚未配置 OPENAI_API_KEY" }, { status: 503 });
    const { image } = await request.json();
    if (!image || typeof image !== "string") return NextResponse.json({ error: "请上传参考图片" }, { status: 400 });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_ANALYZER_MODEL || "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "你是专业摄影导演。分析参考图片，使用简洁中文描述场景，并严格给出五项 Shot：Pose、Position、Composition、Camera、Expression。不要识别人物身份。" },
            { type: "input_image", image_url: image },
          ],
        }],
        text: { format: { type: "json_schema", name: "shot_analysis", strict: true, schema } },
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "OpenAI 解析失败");
    const text = payload.output_text || payload.output?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content || []).map((item: { text?: string }) => item.text || "").join("");
    if (!text) throw new Error("模型未返回解析结果");
    return NextResponse.json(JSON.parse(text));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "解析失败" }, { status: 500 });
  }
}
