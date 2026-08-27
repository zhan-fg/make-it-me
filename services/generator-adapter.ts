import type { CaptureResult, GenerationRequest, GenerationResult, NormalizedBoundingBox, ReferenceAnalysis, TargetShot } from "./types";

function loadMedia(source: string, mediaType: "image" | "video") {
  return new Promise<HTMLImageElement | HTMLVideoElement>((resolve, reject) => {
    const media = mediaType === "video" ? document.createElement("video") : new Image();
    if (media instanceof HTMLVideoElement) { media.muted = true; media.playsInline = true; media.onloadeddata = () => resolve(media); }
    else media.onload = () => resolve(media);
    media.onerror = () => reject(new Error("无法处理生成参考素材")); media.src = source;
  });
}

async function normalizeImage(source: string, mediaType: "image" | "video" = "image", faceBox?: NormalizedBoundingBox) {
  if (!source.startsWith("data:")) throw new Error("生成只接受本次上传或采集的本地素材");
  const media = await loadMedia(source, mediaType);
  if (media instanceof HTMLVideoElement && media.duration > 0.1) { media.currentTime = Math.min(0.25, media.duration / 2); await new Promise((resolve) => { media.onseeked = resolve; }); }
  const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  let sourceX = 0; let sourceY = 0; let sourceWidth = width; let sourceHeight = height;
  if (faceBox) {
    const faceCenterX = (faceBox.x + faceBox.width / 2) * width;
    const faceCenterY = (faceBox.y + faceBox.height * .65) * height;
    sourceWidth = Math.min(width, Math.max(faceBox.width * width * 2.4, 320));
    sourceHeight = Math.min(height, Math.max(faceBox.height * height * 3.1, sourceWidth * 1.15));
    sourceX = Math.max(0, Math.min(width - sourceWidth, faceCenterX - sourceWidth / 2));
    sourceY = Math.max(0, Math.min(height - sourceHeight, faceCenterY - sourceHeight * .42));
  }
  const scale = Math.min(1, 1536 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(sourceWidth * scale)); canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  canvas.getContext("2d")?.drawImage(media, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return { image: canvas.toDataURL("image/jpeg", 0.9), width: canvas.width, height: canvas.height };
}

function personRegion(analysis: ReferenceAnalysis): NormalizedBoundingBox {
  const person = analysis.geometry.personBoundingBox || analysis.scene.subjectRegion;
  const face = analysis.geometry.faceBoundingBox;
  if (person) return person;
  if (face) return {
    x: Math.max(0, face.x - face.width * .9), y: Math.max(0, face.y - face.height * 1.2),
    width: Math.min(1, face.width * 2.8), height: Math.min(1, face.height * 4.5),
  };
  return { x: .2, y: .05, width: .6, height: .9 };
}

function createPersonEditMask(width: number, height: number, region: NormalizedBoundingBox, source: "mediapipe-pose-envelope" | "geometry-envelope") {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建人物编辑蒙版");
  context.fillStyle = "black"; context.fillRect(0, 0, width, height);
  const paddingX = region.width * width * .08; const paddingY = region.height * height * .05;
  const x = Math.max(0, region.x * width - paddingX); const y = Math.max(0, region.y * height - paddingY);
  const boxWidth = Math.min(width - x, region.width * width + paddingX * 2); const boxHeight = Math.min(height - y, region.height * height + paddingY * 2);
  context.fillStyle = "white"; context.beginPath(); context.roundRect(x, y, boxWidth, boxHeight, Math.min(boxWidth, boxHeight) * .18); context.fill();
  return { image: canvas.toDataURL("image/png"), source, region };
}

function bestIdentityFrames(capture: CaptureResult) {
  const ranked = [...capture.selectedFrames].sort((left, right) => right.quality.score - left.quality.score);
  const front = ranked.find((frame) => frame.instructionId === "front");
  const expression = ranked.find((frame) => frame.instructionId === "expression");
  const angle = ranked.find((frame) => !["front", "expression", "hold", "distance"].includes(frame.instructionId));
  return [front, angle, expression, ...ranked.filter((frame) => frame !== front && frame !== angle && frame !== expression)]
    .filter((frame): frame is NonNullable<typeof frame> => Boolean(frame))
    .slice(0, 3);
}

export const generatorAdapter = {
  async generate(reference: string | undefined, capture: CaptureResult, targetShot: TargetShot, referenceAnalysis: ReferenceAnalysis): Promise<GenerationResult> {
    if (!reference) throw new Error("缺少参考素材，无法开始真实生成");
    const frames = bestIdentityFrames(capture);
    const [referenceMedia, ...identityMedia] = await Promise.all([normalizeImage(reference, referenceAnalysis.reference.mediaType), ...frames.map((frame) => normalizeImage(frame.dataUrl, "image", frame.faceBox))]);
    const region = personRegion(referenceAnalysis);
    const maskSource = referenceAnalysis.geometry.bodyKeypointsAvailable ? "mediapipe-pose-envelope" as const : "geometry-envelope" as const;
    const request: GenerationRequest = {
      replacementMode: "full_person",
      clothingStrategy: "reference_outfit",
      referenceImage: referenceMedia.image,
      referenceSize: { width: referenceMedia.width, height: referenceMedia.height },
      personEditMask: createPersonEditMask(referenceMedia.width, referenceMedia.height, region, maskSource),
      identityFrames: frames.map((frame, index) => ({ image: identityMedia[index].image, view: frame.instructionId, qualityScore: frame.quality.score })),
      fullBodyImage: capture.fullBodyImage ? (await normalizeImage(capture.fullBodyImage)).image : undefined,
      referenceAnalysis, targetShot, preserveScene: referenceAnalysis.scene.preserveRecommended, intensity: 85,
      expressionPolicy: {
        targetExpression: referenceAnalysis.shot.face.expression,
        targetGaze: referenceAnalysis.shot.face.gaze,
        mouthState: referenceAnalysis.shot.face.expression.match(/露齿|牙齿|toothy|teeth/i) ? "teeth_visible" : referenceAnalysis.shot.face.expression.match(/张嘴|微张|open mouth|mouth open/i) ? "slightly_open" : "closed",
        hasMatchingExpressionFrame: frames.some((frame) => frame.instructionId === "expression" && frame.requestedMouthState === "teeth_visible"),
      },
    };
    const accessCode = window.sessionStorage.getItem("make-it-me-access-code") || "";
    const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", "x-app-access-code": accessCode }, body: JSON.stringify(request) });
    const text = await response.text();
    let payload: GenerationResult & { error?: string };
    try { payload = JSON.parse(text); } catch { throw new Error(response.status === 504 ? "图片生成超时，请稍后重试" : "生成服务返回了无法解析的响应"); }
    if (!response.ok) throw new Error(payload.error || "图片生成失败");
    return payload;
  },
};

