import type { FaceLandmarker, NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { BodyOrientation, NormalizedBoundingBox } from "./types";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export type VisionDetection = {
  faceCount: number;
  faceBox?: NormalizedBoundingBox;
  personBox?: NormalizedBoundingBox;
  yaw?: number;
  pitch?: number;
  roll?: number;
  visibility?: number;
  bodyOrientation?: BodyOrientation;
  poseSummary?: string;
  poseAvailable: boolean;
};

let filesetPromise: Promise<Awaited<ReturnType<typeof import("@mediapipe/tasks-vision")["FilesetResolver"]["forVisionTasks"]>>> | undefined;
let imagePromise: Promise<{ face: FaceLandmarker; pose: PoseLandmarker }> | undefined;
let videoPromise: Promise<{ face: FaceLandmarker; pose: PoseLandmarker }> | undefined;

async function createLandmarkers(runningMode: "IMAGE" | "VIDEO") {
  const vision = await import("@mediapipe/tasks-vision");
  filesetPromise ??= vision.FilesetResolver.forVisionTasks(WASM_URL);
  const fileset = await filesetPromise;
  const [face, pose] = await Promise.all([
    vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL_URL }, runningMode, numFaces: 5, outputFacialTransformationMatrixes: true }),
    vision.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: POSE_MODEL_URL }, runningMode, numPoses: 5 }),
  ]);
  return { face, pose };
}

export function getImageLandmarkers() {
  imagePromise ??= createLandmarkers("IMAGE");
  return imagePromise;
}

export function getVideoLandmarkers() {
  videoPromise ??= createLandmarkers("VIDEO");
  return videoPromise;
}

export function landmarksBox(landmarks: NormalizedLandmark[]): NormalizedBoundingBox {
  const xs = landmarks.map((landmark) => landmark.x);
  const ys = landmarks.map((landmark) => landmark.y);
  return { x: Math.max(0, Math.min(...xs)), y: Math.max(0, Math.min(...ys)), width: Math.min(1, Math.max(...xs)) - Math.max(0, Math.min(...xs)), height: Math.min(1, Math.max(...ys)) - Math.max(0, Math.min(...ys)) };
}

function degrees(value: number) { return Math.round((value * 180 / Math.PI) * 10) / 10; }
export function matrixToEuler(matrix?: { data: number[] }) {
  if (!matrix || matrix.data.length < 16) return undefined;
  const values = matrix.data;
  return { yaw: degrees(Math.asin(Math.max(-1, Math.min(1, values[8])))), pitch: degrees(Math.atan2(-values[9], values[10])), roll: degrees(Math.atan2(-values[4], values[0])) };
}

function bodyOrientation(landmarks: NormalizedLandmark[]): BodyOrientation {
  const leftShoulder = landmarks[11]; const rightShoulder = landmarks[12]; const nose = landmarks[0];
  if (!leftShoulder || !rightShoulder) return "front";
  if (!nose || (nose.visibility ?? 1) < 0.35) return "back";
  return Math.abs(rightShoulder.x - leftShoulder.x) < 0.08 ? "side" : "front";
}

export function summarizePose(landmarks: NormalizedLandmark[]) {
  const raised = (landmarks[15] && landmarks[11] && landmarks[15].y < landmarks[11].y) || (landmarks[16] && landmarks[12] && landmarks[16].y < landmarks[12].y);
  return raised ? "检测到手臂抬起" : "检测到自然身体姿态";
}

function normalizeResults(faceResult: ReturnType<FaceLandmarker["detect"]>, poseResult: ReturnType<PoseLandmarker["detect"]>): VisionDetection {
  const detection: VisionDetection = { faceCount: faceResult.faceLandmarks.length, poseAvailable: poseResult.landmarks.length > 0 };
  if (faceResult.faceLandmarks.length) {
    const primaryIndex = faceResult.faceLandmarks.map((landmarks, index) => ({ index, box: landmarksBox(landmarks) })).sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0].index;
    const landmarks = faceResult.faceLandmarks[primaryIndex]; const pose = matrixToEuler(faceResult.facialTransformationMatrixes[primaryIndex]);
    detection.faceBox = landmarksBox(landmarks); detection.visibility = landmarks.reduce((sum, item) => sum + (item.visibility ?? 1), 0) / landmarks.length;
    detection.yaw = pose?.yaw; detection.pitch = pose?.pitch; detection.roll = pose?.roll;
  }
  if (poseResult.landmarks.length) {
    const landmarks = poseResult.landmarks[0]; const visible = landmarks.filter((item) => (item.visibility ?? 1) > 0.25);
    detection.personBox = landmarksBox(visible.length ? visible : landmarks); detection.bodyOrientation = bodyOrientation(landmarks); detection.poseSummary = summarizePose(landmarks);
  }
  return detection;
}

export async function detectImage(source: TexImageSource) {
  const { face, pose } = await getImageLandmarkers();
  return normalizeResults(face.detect(source), pose.detect(source));
}

export async function detectVideo(source: HTMLVideoElement, timestamp = performance.now()) {
  const { face, pose } = await getVideoLandmarkers();
  return normalizeResults(face.detectForVideo(source, timestamp), pose.detectForVideo(source, timestamp));
}
