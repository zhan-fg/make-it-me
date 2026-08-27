import type { BeautySettings, CaptureFrame, FacePoint, NormalizedBoundingBox } from "./types";

export const naturalBeautySettings: BeautySettings = { smoothing: 25, brighten: 8, slimFace: 6, enlargeEyes: 3 };

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("无法读取待精修照片")); image.src = source;
  });
}

function average(points: FacePoint[], indexes: number[]) {
  const available = indexes.map((index) => points[index]).filter(Boolean);
  return available.length ? { x: available.reduce((sum, point) => sum + point.x, 0) / available.length, y: available.reduce((sum, point) => sum + point.y, 0) / available.length } : undefined;
}

function warpFace(context: CanvasRenderingContext2D, width: number, height: number, landmarks: FacePoint[], settings: BeautySettings, faceBox: NormalizedBoundingBox) {
  if (!settings.slimFace && !settings.enlargeEyes) return;
  const source = context.getImageData(0, 0, width, height); const output = new ImageData(width, height); output.data.set(source.data);
  const leftJaw = landmarks[234]; const rightJaw = landmarks[454];
  const leftEye = average(landmarks, [33, 133, 159, 145]); const rightEye = average(landmarks, [362, 263, 386, 374]);
  const faceWidth = faceBox.width * width; const faceHeight = faceBox.height * height;
  const sample = (x: number, y: number, channel: number) => source.data[(Math.max(0, Math.min(height - 1, Math.round(y))) * width + Math.max(0, Math.min(width - 1, Math.round(x)))) * 4 + channel];
  const leftCenter = leftJaw && { x: leftJaw.x * width, y: leftJaw.y * height }; const rightCenter = rightJaw && { x: rightJaw.x * width, y: rightJaw.y * height };
  const eyeCenters = [leftEye, rightEye].filter((point): point is FacePoint => Boolean(point)).map((point) => ({ x: point.x * width, y: point.y * height }));
  const slimAmount = faceWidth * Math.min(15, settings.slimFace) / 100 * .55; const cheekRadius = Math.max(20, faceWidth * .32);
  const eyeScale = Math.min(8, settings.enlargeEyes) / 100 * .9; const eyeRadius = Math.max(10, faceWidth * .13);
  const minX = Math.max(0, Math.floor((faceBox.x - faceBox.width * .18) * width)); const maxX = Math.min(width - 1, Math.ceil((faceBox.x + faceBox.width * 1.18) * width));
  const minY = Math.max(0, Math.floor((faceBox.y - faceBox.height * .12) * height)); const maxY = Math.min(height - 1, Math.ceil((faceBox.y + faceBox.height * 1.12) * height));
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    let sourceX = x; let sourceY = y;
    for (const [center, direction] of [[leftCenter, 1], [rightCenter, -1]] as const) if (center && slimAmount) {
      const distance = Math.hypot(x - center.x, y - center.y); if (distance < cheekRadius) sourceX -= direction * slimAmount * Math.pow(1 - distance / cheekRadius, 2);
    }
    for (const center of eyeCenters) if (eyeScale) {
      const dx = sourceX - center.x; const dy = sourceY - center.y; const distance = Math.hypot(dx, dy);
      if (distance < eyeRadius) { const scale = 1 + eyeScale * Math.pow(1 - distance / eyeRadius, 2); sourceX = center.x + dx / scale; sourceY = center.y + dy / scale; }
    }
    const target = (y * width + x) * 4; for (let channel = 0; channel < 4; channel += 1) output.data[target + channel] = sample(sourceX, sourceY, channel);
  }
  context.putImageData(output, 0, 0);
}

function smoothSkin(context: CanvasRenderingContext2D, width: number, height: number, faceBox: NormalizedBoundingBox, landmarks: FacePoint[], amount: number) {
  if (!amount) return;
  const blurred = document.createElement("canvas"); blurred.width = width; blurred.height = height;
  const blurredContext = blurred.getContext("2d"); if (!blurredContext) return;
  blurredContext.filter = `blur(${1.2 + amount * .045}px)`; blurredContext.drawImage(context.canvas, 0, 0);
  const mask = document.createElement("canvas"); mask.width = width; mask.height = height; const maskContext = mask.getContext("2d"); if (!maskContext) return;
  const centerX = (faceBox.x + faceBox.width / 2) * width; const centerY = (faceBox.y + faceBox.height / 2) * height;
  maskContext.fillStyle = `rgba(255,255,255,${Math.min(45, amount) / 100})`; maskContext.beginPath(); maskContext.ellipse(centerX, centerY, faceBox.width * width * .46, faceBox.height * height * .49, 0, 0, Math.PI * 2); maskContext.fill();
  maskContext.globalCompositeOperation = "destination-out";
  for (const center of [average(landmarks, [33, 133, 159, 145]), average(landmarks, [362, 263, 386, 374])].filter((point): point is FacePoint => Boolean(point))) { maskContext.beginPath(); maskContext.ellipse(center.x * width, center.y * height, faceBox.width * width * .12, faceBox.height * height * .07, 0, 0, Math.PI * 2); maskContext.fill(); }
  const mouth = average(landmarks, [13, 14, 61, 291]); if (mouth) { maskContext.beginPath(); maskContext.ellipse(mouth.x * width, mouth.y * height, faceBox.width * width * .16, faceBox.height * height * .08, 0, 0, Math.PI * 2); maskContext.fill(); }
  blurredContext.globalCompositeOperation = "destination-in"; blurredContext.drawImage(mask, 0, 0); context.drawImage(blurred, 0, 0);
}

export async function retouchFrame(frame: CaptureFrame, settings: BeautySettings): Promise<CaptureFrame> {
  const originalDataUrl = frame.originalDataUrl || frame.dataUrl; const image = await loadImage(originalDataUrl);
  if (!frame.faceBox) return { ...frame, originalDataUrl };
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法进行本地精修");
  context.filter = `brightness(${100 + Math.min(15, settings.brighten)}%) saturate(${100 + Math.round(Math.min(15, settings.brighten) * .25)}%)`; context.drawImage(image, 0, 0); context.filter = "none";
  const landmarks = frame.faceLandmarks || [];
  if (landmarks.length >= 455) warpFace(context, canvas.width, canvas.height, landmarks, settings, frame.faceBox);
  smoothSkin(context, canvas.width, canvas.height, frame.faceBox, landmarks, settings.smoothing);
  return { ...frame, originalDataUrl, dataUrl: canvas.toDataURL("image/jpeg", .92) };
}

