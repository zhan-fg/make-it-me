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

function bestIdentityFrames(capture: CaptureResult) {
  const ranked = [...capture.selectedFrames].sort((left, right) => right.quality.score - left.quality.score);
  const front = ranked.find((frame) => frame.instructionId === "front");
  return [front, ...ranked.filter((frame) => frame !== front)].filter((frame): frame is NonNullable<typeof frame> => Boolean(frame)).slice(0, 3);
}

export const generatorAdapter = {
  async generate(reference: string | undefined, capture: CaptureResult, targetShot: TargetShot, referenceAnalysis: ReferenceAnalysis): Promise<GenerationResult> {
    if (!reference) throw new Error("缺少参考素材，无法开始真实生成");
    const frames = bestIdentityFrames(capture);
    const [referenceMedia, ...identityMedia] = await Promise.all([normalizeImage(reference, referenceAnalysis.reference.mediaType), ...frames.map((frame) => normalizeImage(frame.dataUrl, "image", frame.faceBox))]);
    const request: GenerationRequest = {
      replacementMode: "full_person",
      clothingStrategy: "reference_outfit",
      referenceImage: referenceMedia.image,
      referenceSize: { width: referenceMedia.width, height: referenceMedia.height },
      identityFrames: frames.map((frame, index) => ({ image: identityMedia[index].image, view: frame.instructionId, qualityScore: frame.quality.score })),
      fullBodyImage: capture.fullBodyImage ? (await normalizeImage(capture.fullBodyImage)).image : undefined,
      referenceAnalysis, targetShot, preserveScene: referenceAnalysis.scene.preserveRecommended, intensity: 85,
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

