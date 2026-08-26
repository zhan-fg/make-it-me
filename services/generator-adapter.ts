import type { CaptureResult, GenerationRequest, GenerationResult, ReferenceAnalysis, TargetShot } from "./types";

function loadMedia(source: string, mediaType: "image" | "video") {
  return new Promise<HTMLImageElement | HTMLVideoElement>((resolve, reject) => {
    const media = mediaType === "video" ? document.createElement("video") : new Image();
    if (media instanceof HTMLVideoElement) { media.muted = true; media.playsInline = true; media.onloadeddata = () => resolve(media); }
    else media.onload = () => resolve(media);
    media.onerror = () => reject(new Error("无法处理生成参考素材")); media.src = source;
  });
}

async function normalizeImage(source: string, mediaType: "image" | "video" = "image") {
  if (!source.startsWith("data:")) throw new Error("生成只接受本次上传或采集的本地素材");
  const media = await loadMedia(source, mediaType);
  if (media instanceof HTMLVideoElement && media.duration > 0.1) { media.currentTime = Math.min(0.25, media.duration / 2); await new Promise((resolve) => { media.onseeked = resolve; }); }
  const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  const scale = Math.min(1, 1536 / Math.max(width, height));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(media, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export const generatorAdapter = {
  async generate(reference: string | undefined, capture: CaptureResult, targetShot: TargetShot, referenceAnalysis: ReferenceAnalysis): Promise<GenerationResult> {
    if (!reference) throw new Error("缺少参考素材，无法开始真实生成");
    const [referenceImage, ...identityImages] = await Promise.all([normalizeImage(reference, referenceAnalysis.reference.mediaType), ...capture.selectedFrames.map((frame) => normalizeImage(frame.dataUrl))]);
    const request: GenerationRequest = {
      referenceImage,
      identityFrames: capture.selectedFrames.map((frame, index) => ({ image: identityImages[index], view: frame.instructionId, qualityScore: frame.quality.score })),
      fullBodyImage: capture.fullBodyImage ? await normalizeImage(capture.fullBodyImage) : undefined,
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

