import type { CaptureFrame, PoseTarget, QualityMetric } from "./types";
import type { VisionDetection } from "./mediapipe-vision";

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

function targetYaw(instructionId: string) {
  if (instructionId === "left") return -35;
  if (instructionId === "right" || instructionId === "hold") return 35;
  return 0;
}

export function poseMatchPercent(instructionId: string, yaw?: number, target?: PoseTarget, detection?: VisionDetection) {
  if (yaw === undefined) return null;
  if (instructionId === "target-pose" && target) {
    const angleScores = [target.yaw === null ? 100 : 100 - Math.abs(yaw - target.yaw) * 2.4, target.pitch === null || detection?.pitch === undefined ? 100 : 100 - Math.abs(detection.pitch - target.pitch) * 2.2, target.roll === null || detection?.roll === undefined ? 100 : 100 - Math.abs(detection.roll - target.roll) * 2.2];
    const orientationScore = !detection?.bodyOrientation || detection.bodyOrientation === target.bodyOrientation ? 100 : 45;
    const targetFace = target.faceRegion; const face = detection?.faceBox;
    const framingScore = !targetFace || !face ? 80 : Math.max(0, 100 - Math.abs((face.width * face.height) - (targetFace.width * targetFace.height)) * 260 - Math.abs((face.y + face.height / 2) - (targetFace.y + targetFace.height / 2)) * 120);
    return Math.max(0, Math.round((angleScores.reduce((sum, score) => sum + Math.max(0, score), 0) / angleScores.length) * .65 + orientationScore * .2 + framingScore * .15));
  }
  return Math.max(0, Math.round(100 - Math.abs(yaw - targetYaw(instructionId)) * 2.2));
}

export function poseGuidance(target: PoseTarget, detection?: VisionDetection) {
  if (!detection?.faceBox) return "请让脸进入目标轮廓";
  if (target.yaw !== null && detection.yaw !== undefined && Math.abs(detection.yaw - target.yaw) > 8) return detection.yaw < target.yaw ? "头部再向右转一点" : "头部再向左转一点";
  if (target.pitch !== null && detection.pitch !== undefined && Math.abs(detection.pitch - target.pitch) > 7) return detection.pitch < target.pitch ? "下巴稍微抬高" : "下巴稍微降低";
  if (target.roll !== null && detection.roll !== undefined && Math.abs(detection.roll - target.roll) > 7) return detection.roll < target.roll ? "头部稍向右倾" : "头部稍向左倾";
  if (detection.bodyOrientation && detection.bodyOrientation !== target.bodyOrientation) return target.bodyOrientation === "front" ? "肩膀转向正面" : "身体再侧转一些";
  if (target.faceRegion) {
    const sizeRatio = (detection.faceBox.width * detection.faceBox.height) / Math.max(.001, target.faceRegion.width * target.faceRegion.height);
    if (sizeRatio < .7) return "再靠近镜头一点";
    if (sizeRatio > 1.4) return "稍微后退一点";
  }
  return "姿势接近，请保持稳定";
}

export async function evaluateFrame(canvas: HTMLCanvasElement, instructionId: string, faceBoxes?: FaceBox[], vision?: VisionDetection, target?: PoseTarget): Promise<CaptureFrame> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取相机画面");
  const { brightness, sharpness } = imageStats(context, canvas.width, canvas.height);
  const detectedFaces = vision ? vision.faceCount : faceBoxes ? faceBoxes.length : null;
  const largestFace = vision?.faceBox ? vision.faceBox.width * vision.faceBox.height : faceBoxes?.reduce((largest, face) => Math.max(largest, face.width * face.height), 0);
  const faceSize = largestFace ? Math.round((vision?.faceBox ? largestFace : largestFace / (canvas.width * canvas.height)) * 100) : null;
  const poseMatch = poseMatchPercent(instructionId, vision?.yaw, target, vision);
  const confidence = vision?.visibility === undefined ? null : Math.round(vision.visibility * 100);
  const brightnessGood = brightness >= 55 && brightness <= 210;
  const sharpnessGood = sharpness >= 18;
  const faceGood = detectedFaces === null || detectedFaces === 1;
  const sizeGood = faceSize === null || (faceSize >= 8 && faceSize <= 55);
  const poseGood = poseMatch === null || poseMatch >= 70;
  const confidenceGood = confidence === null || confidence >= 75;
  const score = Math.round((brightnessGood ? 20 : 10) + (sharpnessGood ? 24 : 10) + (faceGood ? 16 : 4) + (sizeGood ? 14 : 6) + (poseGood ? 18 : 5) + (confidenceGood ? 8 : 3));
  return { id: `frame-${Date.now()}-${instructionId}`, dataUrl: canvas.toDataURL("image/jpeg", .9), capturedAt: Date.now(), instructionId, faceBox: vision?.faceBox ? { ...vision.faceBox, x: 1 - vision.faceBox.x - vision.faceBox.width } : undefined, faceLandmarks: vision?.faceLandmarks?.map((point) => ({ x: 1 - point.x, y: point.y })), targetPoseMatched: instructionId === "target-pose" && (poseMatch ?? 0) >= 75, quality: { faceCount: metric(detectedFaces, faceGood), faceSize: metric(faceSize, sizeGood), sharpness: metric(sharpness, sharpnessGood), brightness: metric(brightness, brightnessGood), poseMatch: metric(poseMatch, poseGood), occlusion: { value: null, status: "unavailable" }, confidence: metric(confidence, confidenceGood), score } };
}

export function selectBestFrames(candidates: CaptureFrame[], count: number) {
  const bestByInstruction = new Map<string, CaptureFrame>();
  [...candidates].sort((left, right) => right.quality.score - left.quality.score).forEach((frame) => {
    const target = frame.instructionId === "hold" ? "right" : frame.instructionId;
    if (!bestByInstruction.has(target)) bestByInstruction.set(target, frame);
  });
  return [...bestByInstruction.values()].sort((left, right) => right.quality.score - left.quality.score).slice(0, count);
}

