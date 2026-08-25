import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api-security";

export const runtime = "nodejs";
export const maxDuration = 300;

function dashscopeBaseUrl() {
  return (process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, "");
}

async function generateWithWanx(input: Record<string, unknown>) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("服务端尚未配置 DASHSCOPE_API_KEY");
  const images = [input.referenceImage, input.appearanceImage, ...Object.entries((input.appearanceParts as Record<string, string>) || {}).filter(([key]) => key !== "identity").map(([, value]) => value)]
    .filter((value): value is string => typeof value === "string")
    .map((value) => {
      if (!value.startsWith("data:image/")) throw new Error("只接受用户上传的本地图片");
      return value;
    })
    .map((image) => ({ image }));
  const response = await fetch(`${dashscopeBaseUrl()}/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.DASHSCOPE_IMAGE_MODEL || "wan2.7-image",
      input: { messages: [{ role: "user", content: [
        ...images,
        { text: `进行高品质写实仿拍。图1是参考镜头，保留其场景、光线、机位、构图、动作和表情，还原强度为${input.intensity}%。图2是主要人物身份参考，将图1中的人物替换成图2中的人物，保持可辨认的面部身份、自然人体结构与真实皮肤质感。其余图片依次作为发型、妆容、穿搭或配饰参考。不要复制图1人物的身份，只输出一张精致的消费级摄影结果。` },
      ] }] },
      parameters: { size: process.env.DASHSCOPE_IMAGE_SIZE || "2K", n: 1, watermark: false },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "通义万相生成失败");
  const content = payload.output?.choices?.[0]?.message?.content || [];
  const imageUrl = content.find((item: { image?: string; type?: string }) => item.image)?.image;
  if (!imageUrl) throw new Error("通义万相未返回图片");
  return { id: `wanx-${Date.now()}`, imageUrl };
}

function sourceToBlob(source: string) {
  const match = source.match(/^data:(.+?);base64,(.+)$/);
  if (match) return new Blob([Buffer.from(match[2], "base64")], { type: match[1] });
  throw new Error("只接受用户上传的本地图片");
}

export async function POST(request: Request) {
  try {
    const guard = guardApiRequest(request, "generate");
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const input = await request.json();
    if (!input.referenceImage || !input.appearanceImage) return NextResponse.json({ error: "参考图和我的形象都是必需的" }, { status: 400 });
    if ((process.env.AI_PROVIDER || "openai").toLowerCase() === "wanx") {
      return NextResponse.json(await generateWithWanx(input));
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "服务端尚未配置 OPENAI_API_KEY" }, { status: 503 });

    const form = new FormData();
    form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
    form.append("image[]", sourceToBlob(input.referenceImage), "reference.png");
    form.append("image[]", sourceToBlob(input.appearanceImage), "identity.png");
    const optionalParts = Object.entries(input.appearanceParts || {}).filter(([key]) => key !== "identity");
    for (const [key, value] of optionalParts) form.append("image[]", sourceToBlob(String(value)), `${key}.png`);
    form.append("prompt", `Create a premium photorealistic remake. Image 1 is the reference shot: preserve its scene, lighting, camera angle, composition, pose and expression with ${input.intensity}% fidelity. Image 2 is the primary identity reference: replace the person in image 1 with this person while preserving their recognizable facial identity, natural anatomy and realistic skin texture. Any remaining images provide hair, makeup, outfit or accessory guidance. Do not copy the identity of the person in image 1. Return one polished consumer photography result.`);
    form.append("size", "1024x1024");
    form.append("quality", "high");
    form.append("output_format", "jpeg");

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "OpenAI 生成失败");
    const encoded = payload.data?.[0]?.b64_json;
    if (!encoded) throw new Error("模型未返回图片");
    return NextResponse.json({ id: `openai-${Date.now()}`, imageUrl: `data:image/jpeg;base64,${encoded}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成失败" }, { status: 500 });
  }
}
