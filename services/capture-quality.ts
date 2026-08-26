import type { CaptureFrame, QualityMetric } from "./types";

type FaceBox = { width: number; height: number };
const metric = (value: number | null, good: boolean): QualityMetric => value === null ? { value: null, status: "unavailable" } : { value, status: good ? "good" : "warning" };

function imageStats(context: CanvasRenderingContext2D, width: number, height: number) {
  const sampleWidth = Math.min(width, 240);
  const sampleHeight = Math.max(1, Math.round(height * sampleWidth / width));
  const sample = document.createElement("canvas");
  sample.width = sampleWidth; sample.height = sampleHeight;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return { brightness: 0, sharpness: 0 };
  sampleContext.drawImage(context.canvas, 0, 0, sampleWidth, sampleHeight);
  const data = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let brightnessTotal = 0; let edgeTotal = 0;
  for (let index = 0; index < data.length; index += 4) {
    const luminance = (data[index] * .299) + (data[index + 1] * .587) + (data[index + 2] * .114);
    brightnessTotal += luminance;
    if (index >= 4) edgeTotal += Math.abs(luminance - ((data[index - 4] * .299) + (data[index - 3] * .587) + (data[index - 2] * .114)));
  }
  const pixels = data.length / 4;
  return { brightness: Math.round(brightnessTotal / pixels), sharpness: Math.min(100, Math.round((edgeTotal / pixels) * 4)) };
}

export async function evaluateFrame(canvas: HTMLCanvasElement, instructionId: string, faceBoxes?: FaceBox[]): Promise<CaptureFrame> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取相机画面");
  const { brightness, sharpness } = imageStats(context, canvas.width, canvas.height);
  const detectedFaces = faceBoxes ? faceBoxes.length : null;
  const largestFace = faceBoxes?.reduce((largest, face) => Math.max(largest, face.width * face.height), 0);
  const faceSize = largestFace ? Math.round((largestFace / (canvas.width * canvas.height)) * 100) : null;
  const brightnessGood = brightness >= 55 && brightness <= 210;
  const sharpnessGood = sharpness >= 18;
  const faceGood = detectedFaces === null || detectedFaces === 1;
  const sizeGood = faceSize === null || (faceSize >= 8 && faceSize <= 55);
  const score = Math.round((brightnessGood ? 28 : 14) + (sharpnessGood ? 32 : 14) + (faceGood ? 20 : 5) + (sizeGood ? 20 : 8));
  return { id: `frame-${Date.now()}-${instructionId}`, dataUrl: canvas.toDataURL("image/jpeg", .9), capturedAt: Date.now(), instructionId, quality: { faceCount: metric(detectedFaces, faceGood), faceSize: metric(faceSize, sizeGood), sharpness: metric(sharpness, sharpnessGood), brightness: metric(brightness, brightnessGood), poseMatch: { value: null, status: "unavailable" }, occlusion: { value: null, status: "unavailable" }, confidence: { value: null, status: "unavailable" }, score } };
}

export const selectBestFrames = (candidates: CaptureFrame[], count: number) => [...candidates].sort((left, right) => right.quality.score - left.quality.score).slice(0, count);
