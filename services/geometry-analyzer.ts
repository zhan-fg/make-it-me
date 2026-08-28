import { detectImage } from "./mediapipe-vision";
import type { BodyCoverage, GeometryAnalysis, GeometryAnalyzerAdapter, NormalizedBoundingBox } from "./types";

type DetectedFace = { boundingBox: DOMRectReadOnly };
type FaceDetectorInstance = { detect(source: CanvasImageSource): Promise<DetectedFace[]> };
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorInstance;


const unavailable = (capability: string, note?: string) => ({ source: "unavailable" as const, available: false, capability, note });

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取参考图片"));
    image.src = source;
  });
}

function loadVideoFrame(source: string) {
  return new Promise<{ canvas: HTMLCanvasElement; width: number; height: number; duration?: number }>((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onerror = () => reject(new Error("无法读取参考视频"));
    video.onloadedmetadata = () => {
      const draw = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        resolve({ canvas, width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : undefined });
      };
      if (video.duration > 0.2) {
        video.onseeked = draw;
        video.currentTime = Math.min(0.25, video.duration / 2);
      } else {
        video.onloadeddata = draw;
      }
    };
    video.src = source;
  });
}

function normalizeBox(box: DOMRectReadOnly, width: number, height: number): NormalizedBoundingBox {
  return {
    x: Math.max(0, box.x / width),
    y: Math.max(0, box.y / height),
    width: Math.min(1, box.width / width),
    height: Math.min(1, box.height / height),
  };
}


function inferCoverage(face: NormalizedBoundingBox): BodyCoverage {
  if (face.height >= 0.34) return "face";
  if (face.height >= 0.2) return "upper_body";
  if (face.height >= 0.11) return "three_quarter";
  return "full_body";
}

function coverageLabel(coverage: BodyCoverage) {
  return { face: "近景", upper_body: "半身", three_quarter: "中远景", full_body: "全身" }[coverage];
}

function inferPosition(face: NormalizedBoundingBox) {
  const center = face.x + face.width / 2;
  if (center < 0.4) return "人物位于画面左侧";
  if (center > 0.6) return "人物位于画面右侧";
  return "人物位于画面中央";
}

function estimatePersonBox(face: NormalizedBoundingBox): NormalizedBoundingBox {
  const width = Math.min(1, face.width * 2.7);
  const height = Math.min(1 - face.y, face.height * 6.5);
  return { x: Math.max(0, Math.min(1 - width, face.x + face.width / 2 - width / 2)), y: face.y, width, height };
}

export const browserGeometryAnalyzer: GeometryAnalyzerAdapter = {
  detectCapabilities() {
    const FaceDetector = typeof window === "undefined" ? undefined : (window as typeof window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
    return {
      imageDimensions: typeof document !== "undefined",
      faceDetector: Boolean(FaceDetector),
      bodyKeypoints: typeof WebAssembly !== "undefined",
      headPose: typeof WebAssembly !== "undefined",
      personSegmentation: false,
      depth: false,
      occlusion: false,
    };
  },

  async analyze({ source, mediaType }): Promise<GeometryAnalysis> {
    const capabilities = this.detectCapabilities();
    const warnings: string[] = [];
    const provenance: GeometryAnalysis["provenance"] = {
      "geometry.personMaskAvailable": unavailable("person-segmentation", "Person Segmentation adapter 尚未接入"),
      "geometry.bodyKeypointsAvailable": unavailable("pose-landmarker", "MediaPipe Pose Landmarker 未运行"),
      "geometry.headPoseAvailable": unavailable("face-landmarker", "MediaPipe Face Landmarker 未运行"),
      "scene.depthAvailable": unavailable("monocular-depth", "Depth adapter 尚未接入"),
      "scene.occlusionAvailable": unavailable("occlusion-map", "Occlusion adapter 尚未接入"),
    };
    const empty: GeometryAnalysis = {
      reference: { mediaType },
      geometry: { personMaskAvailable: false, bodyKeypointsAvailable: false, headPoseAvailable: false },
      inferred: {},
      provenance,
      warnings,
    };

    if (!source) {
      warnings.push("模板没有原始媒体，Geometry Analyzer 无法执行真实检测");
      provenance["reference.dimensions"] = unavailable("media-metadata");
      provenance["geometry.faceBoundingBox"] = unavailable("face-detector");
      return empty;
    }

    try {
      let sourceForDetection: CanvasImageSource;
      let representativeFrame: string | undefined;
      let width: number;
      let height: number;
      let duration: number | undefined;

      if (mediaType === "video") {
        const frame = await loadVideoFrame(source);
        sourceForDetection = frame.canvas;
        representativeFrame = frame.canvas.toDataURL("image/jpeg", 0.86);
        width = frame.width;
        height = frame.height;
        duration = frame.duration;
      } else {
        const image = await loadImage(source);
        sourceForDetection = image;
        width = image.naturalWidth;
        height = image.naturalHeight;
        representativeFrame = source;
      }

      empty.reference = { mediaType, width, height, duration };
      empty.representativeFrame = representativeFrame;
      provenance["reference.dimensions"] = { source: "browser-metadata", available: true, capability: "media-metadata", confidence: 1 };

      try {
        const detection = await detectImage(sourceForDetection as TexImageSource);
        empty.geometry.faceCount = detection.faceCount;
        provenance["geometry.faceCount"] = { source: "mediapipe-face-landmarker", available: true, capability: "face-landmarker", confidence: 0.95 };

        if (detection.faceBox) {
          const faceBox = detection.faceBox;
          const coverage = inferCoverage(faceBox);
          empty.geometry.faceBoundingBox = faceBox;
          empty.geometry.headPoseAvailable = detection.yaw !== undefined;
          empty.inferred = {
            ...empty.inferred,
            subjectPosition: inferPosition(faceBox), coverage, framing: coverageLabel(coverage),
            shotType: coverage === "face" ? "close_up" : coverage === "full_body" ? "full" : "medium",
            faceVisibility: detection.visibility === undefined ? undefined : Math.round(detection.visibility * 100) / 100,
            faceYaw: detection.yaw, facePitch: detection.pitch, faceRoll: detection.roll,
          };
          provenance["geometry.faceBoundingBox"] = { source: "mediapipe-face-landmarker", available: true, capability: "face-landmarker", confidence: 0.95 };
          provenance["geometry.headPoseAvailable"] = detection.yaw !== undefined
            ? { source: "mediapipe-face-landmarker", available: true, capability: "facial-transformation-matrix", confidence: 0.9 }
            : unavailable("facial-transformation-matrix", "模型未返回头部变换矩阵");
          provenance["shot.face.visibility"] = { source: "mediapipe-face-landmarker", available: true, capability: "face-landmark-visibility", confidence: 0.85 };
          provenance["shot.body.coverage"] = { source: "geometry-heuristic", available: true, capability: "face-scale-coverage", confidence: 0.65 };
          provenance["shot.subjectPosition"] = { source: "mediapipe-face-landmarker", available: true, capability: "face-center-position", confidence: 0.9 };
        }

        if (detection.personBox) {
          const personBox = detection.personBox;
          empty.geometry.personBoundingBox = personBox;
          empty.geometry.bodyKeypointsAvailable = true;
          empty.inferred = {
            ...empty.inferred,
            subjectRegion: personBox,
            bodyOrientation: detection.bodyOrientation,
            poseSummary: detection.poseSummary,
          };
          provenance["geometry.personBoundingBox"] = { source: "mediapipe-pose-landmarker", available: true, capability: "pose-landmarker", confidence: 0.9 };
          provenance["geometry.bodyKeypointsAvailable"] = { source: "mediapipe-pose-landmarker", available: true, capability: "pose-landmarker", confidence: 0.9 };
          provenance["shot.body.orientation"] = { source: "mediapipe-pose-landmarker", available: true, capability: "shoulder-orientation", confidence: 0.65 };
          provenance["shot.body.poseSummary"] = { source: "mediapipe-pose-landmarker", available: true, capability: "pose-landmarks", confidence: 0.75 };
        }

        if (detection.faceCount || detection.poseAvailable) return empty;
        warnings.push("MediaPipe 未检测到清晰的人脸或人体姿态");
      } catch (error) {
        warnings.push(`MediaPipe 几何分析不可用：${error instanceof Error ? error.message : "模型加载失败"}`);
      }

      const Detector = (window as typeof window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
      if (!capabilities.faceDetector || !Detector) {
        warnings.push("MediaPipe 与浏览器 FaceDetector 均不可用；几何分析未完成");
        provenance["geometry.faceBoundingBox"] = unavailable("face-landmarker", "MediaPipe 加载失败且浏览器无原生 FaceDetector");
        return empty;
      }

      const faces = await new Detector({ fastMode: true, maxDetectedFaces: 5 }).detect(sourceForDetection);
      empty.geometry.faceCount = faces.length;
      provenance["geometry.faceCount"] = { source: "browser-face-detector", available: true, capability: "face-detector", confidence: 0.9 };
      if (!faces.length) {
        warnings.push("FaceDetector 未检测到清晰人脸");
        provenance["geometry.faceBoundingBox"] = unavailable("face-detector", "检测已运行但没有结果");
        return empty;
      }

      const primary = [...faces].sort((left, right) => right.boundingBox.width * right.boundingBox.height - left.boundingBox.width * left.boundingBox.height)[0];
      const faceBox = normalizeBox(primary.boundingBox, width, height);
      const personBox = estimatePersonBox(faceBox);
      const coverage = inferCoverage(faceBox);
      empty.geometry.faceBoundingBox = faceBox;
      empty.geometry.personBoundingBox = personBox;
      empty.inferred = {
        subjectPosition: inferPosition(faceBox),
        coverage,
        framing: coverageLabel(coverage),
        shotType: coverage === "face" ? "close_up" : coverage === "full_body" ? "full" : "medium",
        faceVisibility: 1,
        subjectRegion: personBox,
      };
      provenance["geometry.faceBoundingBox"] = { source: "browser-face-detector", available: true, capability: "face-detector", confidence: 0.9 };
      provenance["geometry.personBoundingBox"] = { source: "geometry-heuristic", available: true, capability: "face-to-person-estimate", confidence: 0.45, note: "由真实人脸框估算，并非人物检测框" };
      provenance["shot.body.coverage"] = { source: "geometry-heuristic", available: true, capability: "face-scale-coverage", confidence: 0.55 };
      provenance["shot.subjectPosition"] = { source: "geometry-heuristic", available: true, capability: "face-center-position", confidence: 0.75 };
      provenance["shot.face.visibility"] = { source: "geometry-heuristic", available: true, capability: "face-detection-visibility", confidence: 0.6 };
      return empty;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Geometry Analyzer 执行失败");
      provenance["reference.dimensions"] = unavailable("media-metadata", "媒体解码失败");
      provenance["geometry.faceBoundingBox"] = unavailable("face-detector", "媒体解码失败，未执行检测");
      return empty;
    }
  },
};

