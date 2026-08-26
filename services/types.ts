export type CaptureMode = "simple" | "standard" | "advanced";
export type BodyCoverage = "face" | "upper_body" | "three_quarter" | "full_body";
export type BodyOrientation = "front" | "side" | "back_three_quarter" | "back";

export type TargetShot = {
  id: string;
  shotType: "close_up" | "medium" | "full" | "motion";
  mediaType: "image" | "video";
  face: { yaw: number; pitch: number; roll: number; visibility: number };
  body: { coverage: BodyCoverage; orientation: BodyOrientation };
  scene: string;
  consumerSummary: string[];
};

export type IdentityRequirement = {
  mode: CaptureMode;
  reason: string;
  faceViews: Array<"front" | "left_45" | "right_45" | "left_profile" | "right_profile">;
  needsFullBody: boolean;
  captureDurationSeconds: number;
  bestFrameCount: number;
  materials: string[];
};

export type CaptureInstruction = {
  id: string;
  label: string;
  hint: string;
  target: "front" | "left" | "right" | "distance" | "body";
  holdMs: number;
};

export type QualityMetric = { value: number | null; status: "good" | "warning" | "unavailable" };

export type CaptureFrame = {
  id: string;
  dataUrl: string;
  capturedAt: number;
  instructionId: string;
  quality: {
    faceCount: QualityMetric;
    faceSize: QualityMetric;
    sharpness: QualityMetric;
    brightness: QualityMetric;
    poseMatch: QualityMetric;
    occlusion: QualityMetric;
    confidence: QualityMetric;
    score: number;
  };
};

export type CaptureResult = {
  mode: CaptureMode;
  candidates: CaptureFrame[];
  selectedFrames: CaptureFrame[];
  fullBodyImage?: string;
  detector: "browser-face-detector" | "local-quality-only";
};

export type EphemeralIdentitySession = {
  id: string;
  createdAt: number;
  targetShot: TargetShot;
  requirement: IdentityRequirement;
  capture?: CaptureResult;
  scope: "session";
};

export type AnalysisResult = {
  scene: { title: string; detail: string; confidence: number };
  shot: Array<{ label: string; value: string }>;
};

export type GenerationRequest = {
  appearanceId: string;
  appearanceImage: string;
  appearanceParts?: Record<string, string>;
  referenceImage: string;
  preserveScene: boolean;
  intensity: number;
};

export type GenerationResult = { id: string; imageUrl: string };

export interface AnalyzerAdapter {
  analyze(image: string): Promise<AnalysisResult>;
}

export interface GeneratorAdapter {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}
