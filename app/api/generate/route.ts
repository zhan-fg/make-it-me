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
  if (input.identityFrames.length > 3) throw new Error("为保持原图构图，身份关键帧最多 3 张");
  validateImage(input.referenceImage, "参考图");
  if (!input.personEditMask?.region) throw new Error("缺少人物编辑蒙版");
  validateImage(input.personEditMask.image, "人物编辑蒙版");
  input.identityFrames.forEach((frame, index) => validateImage(frame?.image, `身份关键帧 ${index + 1}`));
  if (input.fullBodyImage) validateImage(input.fullBodyImage, "全身参考");
  if (!input.referenceAnalysis || !input.targetShot) throw new Error("缺少镜头分析结果");
  if (!input.characterProfile || !input.photoScenario) throw new Error("缺少角色形象或场景配置");
  if (!input.expressionPolicy) throw new Error("缺少表情生成策略");
  if (!input.referenceSize || input.referenceSize.width < 1 || input.referenceSize.height < 1) throw new Error("缺少参考图尺寸");
  if (["three_quarter", "full_body"].includes(input.referenceAnalysis.shot.body.coverage) && !input.fullBodyImage) throw new Error("中远景或全身镜头需要用户全身参考");
  return input as GenerationRequest;
}
function normalizedPersonRegion(input: GenerationRequest) {
  const person = input.personEditMask.region || input.referenceAnalysis.geometry.personBoundingBox || input.referenceAnalysis.scene.subjectRegion;
  const face = input.referenceAnalysis.geometry.faceBoundingBox;
  if (!person && !face) return { x: .2, y: .05, width: .6, height: .9 };
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
  return { x: Math.max(0, left - paddingX), y: Math.max(0, top - paddingTop), width: Math.min(1, right + paddingX) - Math.max(0, left - paddingX), height: Math.min(1, bottom + paddingBottom) - Math.max(0, top - paddingTop) };
}
function regionBox(region: ReturnType<typeof normalizedPersonRegion>, width: number, height: number) {
  const x1 = Math.max(0, Math.floor(region.x * width)); const y1 = Math.max(0, Math.floor(region.y * height));
  const x2 = Math.min(width, Math.ceil((region.x + region.width) * width)); const y2 = Math.min(height, Math.ceil((region.y + region.height) * height));
  return [x1, y1, x2, y2];
}
function outputSize(input: GenerationRequest) {
  const maximumSide = 2048; const scale = Math.min(1, maximumSide / Math.max(input.referenceSize.width, input.referenceSize.height));
  const width = Math.max(240, Math.round(input.referenceSize.width * scale / 16) * 16);
  const height = Math.max(240, Math.round(input.referenceSize.height * scale / 16) * 16);
  return { width, height, value: `${width}*${height}` };
}
function generationPrompt(input: GenerationRequest) {
  const analysis = input.referenceAnalysis;
  const subject = analysis.geometry.personBoundingBox || analysis.scene.subjectRegion;
  const compositionLock = subject
    ? `图1人物区域约为画面左侧 ${Math.round(subject.x * 100)}%、顶部 ${Math.round(subject.y * 100)}%、宽度 ${Math.round(subject.width * 100)}%、高度 ${Math.round(subject.height * 100)}%。新人物必须占据同一区域，中心点、头顶、脚底和身体外轮廓不得明显移动。`
    : "新人物必须严格覆盖图1原人物的位置与外轮廓，保持相同人物中心点、画面占比和头身比例。";
  const expressionRule = input.expressionPolicy.mouthState === "teeth_visible" && input.expressionPolicy.hasMatchingExpressionFrame
    ? "可以参考专门采集的露齿表情帧生成自然、克制的露齿微笑；保持目标人物真实唇形、牙齿比例和嘴角幅度，不要夸张笑容。"
    : "不要生成或露出牙齿。只保留参考图的整体情绪语气，使用自然闭嘴或极轻微微笑；不得强行复刻原人物的嘴型、牙齿、嘴角幅度或面部肌肉。";
  const strength = { keep_self: "保持目标人物自身特征", inspired: "借鉴参考风格并适配目标人物", match_reference: "高度还原参考图设计" } as const;
  const character = input.characterProfile;
  const scenario = input.photoScenario;
  return [scenario.mode === "reference" ? "任务是对图1进行局部人物替换，不是重新创作场景，也不是多图拼接。图1是唯一的构图底图，输出必须保持图1的完整画布、宽高比和像素方向。" : "任务是以图1的镜头布局为基础创作目标人物写真。保持画布比例、人物位置、姿态和镜头距离，同时按指定场景重新生成环境；不是头像拼贴。",
    `本次真人角色名为“${character.name || "我的角色"}”。图2及之后定义该角色的真实身份，以下妆造配置定义角色外观；身份优先级始终高于风格化。`,
    scenario.mode === "reference" ? "构图锁定为最高优先级：禁止裁切、扩图、缩放、重新取景、改变镜头焦段、改变相机距离、移动人物、放大头部、虚化或重绘背景。背景、前景、地平线、建筑、家具、道具及其位置必须与图1一致。" : "布局锁定为最高优先级：禁止裁切、扩图、缩放、移动人物或放大头部。允许根据指定场景重绘背景，但必须保持图1的人物占比、透视、前后景层次与空间关系。",
    compositionLock,
    "图2及之后的图片只能提供目标人物身份、头发、肤色和身体特征，绝不能提供背景、构图、人物尺寸、相机角度或画面风格。严禁把身份图中的头像直接粘贴到图1，严禁生成头像海报、证件照、大头照或氛围背景人像。",
    "执行完整人物替换，生成一张高品质、写实、自然的仿拍照片。彻底移除图1原人物的身份与身体外观，但保留其原始姿态、身体透视、遮挡关系、人物占比、服装关系和与环境的接触点。",
    scenario.mode === "reference" ? `沿用参考场景：${scenario.scene}。光线：${scenario.lighting}。` : `将场景重新设计为：${scenario.scene}。光线：${scenario.lighting}。场景可以改变，但人物身份必须保持。`,
    `构图：${scenario.composition}；机位：${scenario.camera}；景别：${analysis.shot.framing}。`,
    `姿态：${character.pose}；视线：${input.expressionPolicy.targetGaze}；目标表情：${character.expression}。${expressionRule}`,
    `妆容：${character.makeup.description || "自然妆容"}，策略为“${strength[character.makeup.strength]}”。妆容只能改变彩妆与皮肤呈现，不得改变五官身份。`,
    `发型：${character.hair.description || "自然发型"}，策略为“${strength[character.hair.strength]}”。必须生成完整统一的头发轮廓并清除原人物残留头发。`,
    `服装：${character.outfit.description || "自然服装"}，策略为“${strength[character.outfit.strength]}”。配饰：${character.accessories.description || "无明显配饰"}，策略为“${strength[character.accessories.strength]}”。`,
    `图2开始是同一目标人物的头肩身份参考，角度依次为：${input.identityFrames.map((frame) => frame.view).join("、")}。使用目标人物的完整头部身份：脸型、五官比例、眼睛、鼻子、嘴、耳朵、发际线、发型、发色、颈部与肤色。`,
    input.fullBodyImage ? `最后一张是目标人物全身参考。使用其真实体型、肩宽、身体比例和整体轮廓；服装严格执行角色配置“${character.outfit.description}”，不得误用全身参考中的日常服装。` : "根据头肩参考自然重建目标人物的肩颈与身体，不得沿用图1原人物的头发、肤色、体型或身体特征。",
    "重点保证头发与脸部属于同一目标人物，发际线自然，耳朵和脸颈肤色连续，头部光线与场景一致，严禁仅换脸或把目标人物的脸贴到图1原人物身体上。",
    "完整清除图1原人物的全部头发、发色、发型轮廓、头顶碎发、鬓角、耳后发丝、肩部发梢和背部长发，不得出现双重发型、重影、残留发丝或两种发色。使用身份参考中目标人物的头发重新生成整个头部轮廓，并让发丝边缘与背景自然融合。",
    "环境融合为第二优先级：新人物必须继承图1的主光方向、光比、曝光、白平衡、色温、环境色反射、逆光轮廓和阴影软硬度。保持与背景相同的景深、焦点、锐度、运动模糊、噪点、颗粒和镜头质感。",
    "重建人物与地面、座椅、墙面或道具之间的接触阴影与遮挡关系。头发和衣服边缘必须吸收周围环境色并接受背景透光，禁止硬边抠图、棚拍布光、过度磨皮、HDR、高对比人像或独立头像质感。",
    "输出构图与图1的匹配优先于身份细节、表情细节和美化效果。如果无法同时满足，宁可降低身份精修程度，也不得改变图1构图。",
    scenario.mode === "reference" ? `场景还原强度约 ${Math.max(95, Math.min(100, input.intensity))}%。` : "场景创作必须服从指定的场景、光线和摄影方案，同时保持参考布局。", "保持自然人体结构、真实皮肤纹理和摄影质感；不要拼贴，不要多余人物，不要文字或水印。只输出一张最终照片。"].filter(Boolean).join("\n").slice(0, 5000);
}
function refinementPrompt() {
  return ["只在框选人物区域内进行环境融合精修，不改变人物身份、脸型、五官、发型、身体比例、姿态、表情、服装、构图或背景内容。",
    "让人物与周围环境共享完全一致的曝光、白平衡、色温、主光方向、光比、阴影软硬度和环境反射色。",
    "匹配背景的景深、焦点、锐度、运动模糊、噪点、颗粒、压缩质感和镜头特征。修复头发、耳朵、肩膀、衣服与背景交界处的硬边、光晕和抠图感。",
    "补充人物与地面、座椅、墙面、道具之间合理的接触阴影、遮挡和反射。禁止重新生成背景，禁止改变脸部，禁止美颜、棚拍光、HDR或海报化。只输出融合后的原构图照片。"].join("\n");
}
async function callWan(apiKey: string, model: string, images: string[], prompt: string, size: string, targetBox: number[][], timeoutMs: number) {
  const startedAt = Date.now();
  const response = await fetch(`${dashscopeBaseUrl()}/services/aigc/multimodal-generation/generation`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: { messages: [{ role: "user", content: [...images.map((image) => ({ image })), { text: prompt }] }] }, parameters: { size, n: 1, watermark: false, thinking_mode: true, bbox_list: [targetBox, ...images.slice(1).map(() => [])] } }), signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text(); let payload: any;
  try { payload = JSON.parse(text); } catch { throw new Error(`DashScope 返回非 JSON 响应（HTTP ${response.status}）`); }
  if (!response.ok) throw new Error(payload.message || payload.code || "Wan2.7 图片编辑失败");
  const imageUrl = (payload.output?.choices?.[0]?.message?.content || []).find((item: { image?: string }) => item.image)?.image;
  if (!imageUrl) throw new Error("Wan2.7 未返回生成图片");
  return { imageUrl, requestId: payload.request_id as string | undefined, elapsedMs: Date.now() - startedAt };
}
async function generateWithWan(input: GenerationRequest) {
  const apiKey = process.env.DASHSCOPE_IMAGE_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("服务端尚未配置 DASHSCOPE_IMAGE_API_KEY 或 DASHSCOPE_API_KEY");
  const model = process.env.DASHSCOPE_IMAGE_MODEL || "wan2.7-image";
  const images = [input.referenceImage, ...input.identityFrames.map((frame) => frame.image), ...(input.fullBodyImage ? [input.fullBodyImage] : [])];
  if (images.length > 9) throw new Error("Wan2.7 最多接受 9 张参考图片");
  const startedAt = Date.now(); const size = outputSize(input); const region = normalizedPersonRegion(input);
  const replacement = await callWan(apiKey, model, images, generationPrompt(input), size.value, [regionBox(region, input.referenceSize.width, input.referenceSize.height)], 210_000);
  const refinementEnabled = process.env.DASHSCOPE_ENABLE_REFINEMENT !== "false";
  const refinementBudget = 285_000 - (Date.now() - startedAt);
  const refinement = refinementEnabled && refinementBudget >= 30_000
    ? await callWan(apiKey, model, [replacement.imageUrl], refinementPrompt(), size.value, [regionBox(region, size.width, size.height)], refinementBudget)
    : undefined;
  return { id: replacement.requestId || `dashscope-${Date.now()}`, imageUrl: refinement?.imageUrl || replacement.imageUrl, provider: "dashscope" as const, model,
    elapsedMs: Date.now() - startedAt, requestId: replacement.requestId, refinementRequestId: refinement?.requestId,
    stages: [{ name: "person-replacement" as const, elapsedMs: replacement.elapsedMs }, ...(refinement ? [{ name: "environment-refinement" as const, elapsedMs: refinement.elapsedMs }] : [])] };
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

