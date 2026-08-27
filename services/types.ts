export type CaptureMode = "simple" | "standard" | "advanced";
export type MediaType = "image" | "video";
export type ShotType = "close_up" | "medium" | "full" | "motion";
export type BodyCoverage = "face" | "upper_body" | "three_quarter" | "full_body";
export type BodyOrientation = "front" | "side" | "back_three_quarter" | "back";
export type MouthState = "neutral" | "closed" | "slightly_open" | "teeth_visible";
export type AnalysisSource = "browser-metadata" | "browser-face-detector" | "mediapipe-face-landmarker" | "mediapipe-pose-landmarker" | "geometry-heuristic" | "vlm" | "mock" | "unavailable";

export type NormalizedBoundingBox = { x: number; y: number; width: number; height: number };
export type FieldProvenance = {
  source: AnalysisSource;
  available: boolean;
  capability: string;
  confidence?: number;
  note?: string;
};

export type ReferenceAnalysis = {
  id: string;
  reference: { mediaType: MediaType; width?: number; height?: number; duration?: number };
  scene: {
    summary: string;
    preserveRecommended: boolean;
    subjectRegion?: NormalizedBoundingBox;
    backgroundRegion?: string;
    depthAvailable: boolean;
    occlusionAvailable: boolean;
    lightingContext?: string;
  };
  shot: {
    shotType: ShotType;
    subjectPosition: string;
    composition: string;
    cameraAngle: string;
    framing: string;
    face: {
      yaw: number | null;
      pitch: number | null;
      roll: number | null;
      visibility: number | null;
      gaze: string;
      expression: string;
    };
    body: {
      coverage: BodyCoverage;
      orientation: BodyOrientation;
      poseSummary: string;
      keypointsAvailable: boolean;
    };
    interaction?: string;
  };
  appearance: { outfit?: string; hair?: string; makeup?: string; accessories?: string };
  geometry: {
    personBoundingBox?: NormalizedBoundingBox;
    faceBoundingBox?: NormalizedBoundingBox;
    faceCount?: number;
    personMaskAvailable: boolean;
    bodyKeypointsAvailable: boolean;
    headPoseAvailable: boolean;
  };
  confidence: number;
  warnings: string[];
  provenance: Record<string, FieldProvenance>;
  timeline?: Array<{ timeSeconds: number; poseSummary?: string; faceYaw?: number }>;
};

export type TargetShot = {
  id: string;
  shotType: ShotType;
  mediaType: MediaType;
  face: { yaw: number | null; pitch: number | null; roll: number | null; visibility: number | null };
  body: { coverage: BodyCoverage; orientation: BodyOrientation };
  scene: string;
  consumerSummary: string[];
};

export type IdentityRequirement = {
  mode: CaptureMode;
  reason: string;
  basis: "cv" | "vlm" | "fallback";
  basisSummary: string;
  faceViews: Array<"front" | "left_45" | "right_45" | "left_profile" | "right_profile">;
  needsFullBody: boolean;
  captureDurationSeconds: number;
  bestFrameCount: number;
  materials: string[];
  expressionGuidance: string;
  gazeGuidance: string;
  mouthState: MouthState;
};

export type CaptureInstruction = {
  id: string;
  label: string;
  hint: string;
  target: "front" | "left" | "right" | "distance" | "body" | "expression";
  holdMs: number;
  mouthState?: MouthState;
};

export type QualityMetric = { value: number | null; status: "good" | "warning" | "unavailable" };

export type CaptureFrame = {
  id: string;
  dataUrl: string;
  capturedAt: number;
  instructionId: string;
  requestedMouthState?: MouthState;
  faceBox?: NormalizedBoundingBox;
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
  detector: "mediapipe" | "browser-face-detector" | "local-quality-only";
};

export type EphemeralIdentitySession = {
  id: string;
  createdAt: number;
  referenceAnalysis: ReferenceAnalysis;
  targetShot: TargetShot;
  requirement: IdentityRequirement;
  capture?: CaptureResult;
  scope: "session";
};

export type SemanticAnalysis = {
  scene: { summary: string; preserveRecommended: boolean; backgroundRegion?: string; lightingContext?: string };
  shot: {
    subjectPosition: string;
    composition: string;
    cameraAngle: string;
    framing: string;
    gaze: string;
    expression: string;
    poseSummary: string;
    bodyOrientation: BodyOrientation;
    interaction?: string;
  };
  appearance: { outfit?: string; hair?: string; makeup?: string; accessories?: string };
  confidence: number;
  provider: "dashscope" | "openai" | "gemini" | "mock";
  warnings: string[];
};

export type GenerationRequest = {
  replacementMode: "full_person";
  clothingStrategy: "reference_outfit";
  referenceImage: string;
  referenceSize: { width: number; height: number };
  identityFrames: Array<{ image: string; view: string; qualityScore: number }>;
  fullBodyImage?: string;
  referenceAnalysis: ReferenceAnalysis;
  targetShot: TargetShot;
  preserveScene: boolean;
  intensity: number;
  expressionPolicy: {
    targetExpression: string;
    targetGaze: string;
    mouthState: MouthState;
    hasMatchingExpressionFrame: boolean;
  };
};

export type GenerationResult = { id: string; imageUrl: string; provider: "dashscope"; model: string; elapsedMs: number; requestId?: string };

export interface GeometryAnalyzerAdapter {
  detectCapabilities(): { imageDimensions: boolean; faceDetector: boolean; bodyKeypoints: boolean; headPose: boolean; personSegmentation: boolean; depth: boolean; occlusion: boolean };
  analyze(input: { source?: string; mediaType: MediaType }): Promise<GeometryAnalysis>;
}

export type GeometryAnalysis = {
  reference: ReferenceAnalysis["reference"];
  geometry: ReferenceAnalysis["geometry"];
  inferred: {
    subjectPosition?: string;
    coverage?: BodyCoverage;
    framing?: string;
    shotType?: ShotType;
    faceVisibility?: number;
    faceYaw?: number;
    facePitch?: number;
    faceRoll?: number;
    bodyOrientation?: BodyOrientation;
    poseSummary?: string;
    subjectRegion?: NormalizedBoundingBox;
  };
  representativeFrame?: string;
  provenance: Record<string, FieldProvenance>;
  warnings: string[];
};

export interface SemanticAnalyzerAdapter {
  analyze(input: { image?: string; mediaType: MediaType; referenceId?: string }): Promise<SemanticAnalysis>;
}

export interface GeneratorAdapter {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

