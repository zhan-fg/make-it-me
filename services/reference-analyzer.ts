import { browserGeometryAnalyzer } from "./geometry-analyzer";
import { vlmSemanticAnalyzer } from "./semantic-analyzer";
import type { BodyCoverage, FieldProvenance, ReferenceAnalysis, TargetShot } from "./types";

type AnalyzeReferenceInput = { id?: string; source?: string; mediaType: "image" | "video" };

function inferCoverage(framing: string): BodyCoverage {
  const normalized = framing.toLowerCase();
  if (normalized.includes("全身") || normalized.includes("full")) return "full_body";
  if (normalized.includes("四分之三") || normalized.includes("中远") || normalized.includes("three")) return "three_quarter";
  if (normalized.includes("近") || normalized.includes("特写") || normalized.includes("close")) return "face";
  return "upper_body";
}

function semanticProvenance(provider: "openai" | "gemini" | "mock", confidence: number): FieldProvenance {
  return {
    source: provider === "mock" ? "mock" : "vlm",
    available: true,
    capability: provider === "mock" ? "semantic-mock" : `${provider}-vision`,
    confidence,
  };
}

function orientationSummary(orientation: ReferenceAnalysis["shot"]["body"]["orientation"]) {
  return { front: "人物正向", side: "人物微侧", back_three_quarter: "人物回头", back: "人物背向" }[orientation];
}

function compactSummary(value: string) {
  return value.replace(/[，。,.].*$/, "").trim();
}

export function deriveTargetShot(analysis: ReferenceAnalysis): TargetShot {
  return {
    id: `shot-${analysis.id}`,
    shotType: analysis.shot.shotType,
    mediaType: analysis.reference.mediaType,
    face: {
      yaw: analysis.shot.face.yaw ?? 0,
      pitch: analysis.shot.face.pitch ?? 0,
      roll: analysis.shot.face.roll ?? 0,
      visibility: analysis.shot.face.visibility ?? 0.75,
    },
    body: { coverage: analysis.shot.body.coverage, orientation: analysis.shot.body.orientation },
    scene: analysis.scene.summary,
    consumerSummary: [
      analysis.shot.framing,
      orientationSummary(analysis.shot.body.orientation),
      compactSummary(analysis.shot.face.gaze),
    ],
  };
}

export const referenceAnalyzer = {
  async analyze(input: AnalyzeReferenceInput): Promise<ReferenceAnalysis> {
    const geometry = await browserGeometryAnalyzer.analyze({ source: input.source, mediaType: input.mediaType });
    const semantic = await vlmSemanticAnalyzer.analyze({ image: geometry.representativeFrame, mediaType: input.mediaType, referenceId: input.id });
    const semanticSource = semanticProvenance(semantic.provider, semantic.confidence);
    const coverage = geometry.inferred.coverage ?? inferCoverage(semantic.shot.framing);
    const shotType = input.mediaType === "video" ? "motion" : geometry.inferred.shotType ?? (coverage === "face" ? "close_up" : coverage === "full_body" ? "full" : "medium");
    const provenance = { ...geometry.provenance };
    const semanticFields = [
      "scene.summary", "scene.preserveRecommended", "scene.backgroundRegion", "scene.lightingContext",
      "shot.composition", "shot.cameraAngle", "shot.framing", "shot.face.gaze", "shot.face.expression",
      "shot.body.orientation", "shot.body.poseSummary", "shot.interaction", "appearance.outfit", "appearance.hair",
      "appearance.makeup", "appearance.accessories",
    ];
    semanticFields.forEach((field) => { provenance[field] = semanticSource; });
    provenance["reference.mediaType"] = { source: "browser-metadata", available: true, capability: "media-type", confidence: 1 };
    provenance["scene.subjectRegion"] = geometry.provenance["geometry.personBoundingBox"] ?? { source: "unavailable", available: false, capability: "person-region" };
    if (!geometry.inferred.subjectPosition) provenance["shot.subjectPosition"] = semanticSource;
    if (!geometry.inferred.coverage) provenance["shot.body.coverage"] = semanticSource;
    if (geometry.inferred.framing) provenance["shot.framing"] = geometry.provenance["shot.body.coverage"];
    if (!geometry.inferred.faceVisibility) provenance["shot.face.visibility"] = { source: "unavailable", available: false, capability: "face-visibility" };
    provenance["shot.shotType"] = input.mediaType === "video"
      ? { source: "browser-metadata", available: true, capability: "media-type", confidence: 1 }
      : geometry.inferred.shotType ? geometry.provenance["shot.body.coverage"] : semanticSource;
    provenance["shot.face.yaw"] = geometry.provenance["geometry.headPoseAvailable"];
    provenance["shot.face.pitch"] = geometry.provenance["geometry.headPoseAvailable"];
    provenance["shot.face.roll"] = geometry.provenance["geometry.headPoseAvailable"];

    const hasRealGeometry = geometry.provenance["geometry.faceBoundingBox"]?.source === "browser-face-detector";
    const confidence = hasRealGeometry ? Math.min(1, semantic.confidence * 0.7 + 0.27) : semantic.confidence;
    return {
      id: `reference-${Date.now()}`,
      reference: geometry.reference,
      scene: {
        summary: semantic.scene.summary,
        preserveRecommended: semantic.scene.preserveRecommended,
        subjectRegion: geometry.inferred.subjectRegion,
        backgroundRegion: semantic.scene.backgroundRegion,
        depthAvailable: false,
        occlusionAvailable: false,
        lightingContext: semantic.scene.lightingContext,
      },
      shot: {
        shotType,
        subjectPosition: geometry.inferred.subjectPosition ?? semantic.shot.subjectPosition,
        composition: semantic.shot.composition,
        cameraAngle: semantic.shot.cameraAngle,
        framing: geometry.inferred.framing ?? semantic.shot.framing,
        face: {
          yaw: null,
          pitch: null,
          roll: null,
          visibility: geometry.inferred.faceVisibility ?? null,
          gaze: semantic.shot.gaze,
          expression: semantic.shot.expression,
        },
        body: {
          coverage,
          orientation: semantic.shot.bodyOrientation,
          poseSummary: semantic.shot.poseSummary,
          keypointsAvailable: false,
        },
        interaction: semantic.shot.interaction,
      },
      appearance: semantic.appearance,
      geometry: geometry.geometry,
      confidence,
      warnings: [...geometry.warnings, ...semantic.warnings],
      provenance,
      timeline: input.mediaType === "video" ? [{ timeSeconds: 0, poseSummary: semantic.shot.poseSummary }] : undefined,
    };
  },
};
