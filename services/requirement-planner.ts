import type { CaptureInstruction, IdentityRequirement, MouthState, ReferenceAnalysis, TargetShot } from "./types";

function expressionPlan(expression: string, gaze: string) {
  const normalized = expression.toLowerCase();
  let mouthState: MouthState = "neutral";
  if (/露齿|牙齿|toothy|teeth/.test(normalized)) mouthState = "teeth_visible";
  else if (/张嘴|微张|open mouth|mouth open/.test(normalized)) mouthState = "slightly_open";
  else if (/闭嘴|抿嘴|不露齿|closed mouth/.test(normalized)) mouthState = "closed";
  const expressionGuidance = mouthState === "teeth_visible"
    ? "自然轻微微笑并露出少量牙齿，不要刻意扩大嘴角"
    : mouthState === "slightly_open" ? "自然放松嘴唇并轻微张口，不要刻意做表情"
      : /微笑|笑|smile/.test(normalized) ? "保持自然轻微微笑，嘴唇自然闭合" : "保持自然放松表情，嘴唇自然闭合";
  return { mouthState, expressionGuidance, gazeGuidance: gaze || "自然看向镜头" };
}

function plannerInput(input: ReferenceAnalysis | TargetShot) {
  if ("reference" in input) {
    const yawSource = input.provenance["shot.face.yaw"];
    const orientationSource = input.provenance["shot.body.orientation"];
    const faceSource = input.provenance["geometry.faceBoundingBox"];
    const hasMock = Object.values(input.provenance).some((item) => item.source === "mock");
    const hasFaceCv = faceSource?.available && ["mediapipe-face-landmarker", "browser-face-detector"].includes(faceSource.source);
    const hasHeadPoseCv = yawSource?.available && yawSource.source === "mediapipe-face-landmarker" && input.shot.face.yaw !== null;
    const hasPoseCv = orientationSource?.available && orientationSource.source === "mediapipe-pose-landmarker";
    return {
      mediaType: input.reference.mediaType,
      shotType: input.shot.shotType,
      yaw: input.shot.face.yaw,
      pitch: input.shot.face.pitch,
      roll: input.shot.face.roll,
      faceRegion: input.geometry.faceBoundingBox,
      visibility: input.shot.face.visibility,
      coverage: input.shot.body.coverage,
      orientation: input.shot.body.orientation,
      hasMock,
      hasFaceCv: Boolean(hasFaceCv),
      hasHeadPoseCv: Boolean(hasHeadPoseCv),
      hasPoseCv: Boolean(hasPoseCv),
      expression: input.shot.face.expression,
      gaze: input.shot.face.gaze,
      poseSummary: input.shot.body.poseSummary,
    };
  }
  return {
    mediaType: input.mediaType,
    shotType: input.shotType,
    yaw: input.face.yaw,
    pitch: input.face.pitch,
    roll: input.face.roll,
    faceRegion: undefined,
    visibility: input.face.visibility,
    coverage: input.body.coverage,
    orientation: input.body.orientation,
    hasMock: false,
    hasFaceCv: false,
    hasHeadPoseCv: false,
    hasPoseCv: false,
    expression: "自然表情",
    gaze: "自然看向镜头",
    poseSummary: "沿用参考人物姿势",
  };
}

export function planIdentityRequirement(input: ReferenceAnalysis | TargetShot): IdentityRequirement {
  const target = plannerInput(input);
  const expression = expressionPlan(target.expression, target.gaze);
  const poseTarget = { yaw: target.yaw, pitch: target.pitch, roll: target.roll, faceRegion: target.faceRegion, bodyOrientation: target.orientation, poseSummary: target.poseSummary, expression: target.expression, gaze: target.gaze };
  const absoluteYaw = target.yaw === null ? null : Math.abs(target.yaw);
  const needsFullBody = target.coverage === "three_quarter" || target.coverage === "full_body";
  const needsBodyContext = target.coverage !== "face";
  const turnedBack = target.orientation === "back_three_quarter" || target.orientation === "back";
  const lowVisibility = target.visibility !== null && target.visibility < 0.55;
  const advanced = needsBodyContext || (target.shotType === "motion" && (absoluteYaw === null || absoluteYaw >= 50 || needsFullBody || turnedBack)) || lowVisibility;
  const simple = target.coverage === "face" && target.mediaType === "image" && target.hasFaceCv && target.hasHeadPoseCv && !target.hasMock && absoluteYaw !== null && absoluteYaw < 20 && !needsFullBody && target.orientation === "front" && target.visibility !== null && target.visibility >= 0.8;
  if (simple) return {
    mode: "simple", reason: `MediaPipe 检测到清晰正脸（偏转约 ${Math.round(absoluteYaw)}°），一张自拍就够了。`,
    basis: "cv", basisSummary: "依据 MediaPipe 人脸框、头部姿态与可见度规划",
    faceViews: ["front"], needsFullBody: false, captureDurationSeconds: 3, bestFrameCount: 1, materials: ["1 张与参考姿势匹配的自拍"], ...expression, poseTarget,
  };
  const turnsRight = (target.yaw ?? (target.orientation === "side" ? 35 : 0)) >= 0;
  const basis = target.hasHeadPoseCv || target.hasPoseCv ? "cv" : target.hasMock ? "fallback" : "vlm";
  const basisSummary = basis === "cv"
    ? "依据 MediaPipe 几何检测与 VLM 场景语义规划"
    : basis === "vlm" ? "几何数据不足，依据 VLM 姿态语义保守规划" : "真实分析不完整，采用安全降级规划";
  if (advanced) return {
    mode: "advanced", reason: needsBodyContext ? "完整人物替换需要同时采集头发、肩颈和身体比例。" : lowVisibility ? "人物面部可见度较低，需要更多角度来补足身份信息。" : "镜头包含回头或较大动作变化，需要多角度信息来保持自然。",
    basis, basisSummary,
    faceViews: ["front", turnsRight ? "right_45" : "left_45", turnsRight ? "right_profile" : "left_profile"], needsFullBody,
    captureDurationSeconds: 5, bestFrameCount: 1, materials: ["1 张与参考角度和姿势匹配的自拍", ...(needsFullBody ? ["1 张包含体型和身体比例的全身参考"] : [])], ...expression, poseTarget,
  };
  return {
    mode: "standard",
    reason: absoluteYaw === null ? "没有可靠的头部角度数据，因此使用多角度采集以避免误判。" : `人物存在约 ${Math.round(absoluteYaw)}° 的侧向变化，补充一个侧面角度会更像你。`,
    basis, basisSummary,
    faceViews: ["front", turnsRight ? "right_45" : "left_45"], needsFullBody,
    captureDurationSeconds: 4, bestFrameCount: 1, materials: ["1 张与参考角度和姿势匹配的自拍", ...(needsFullBody ? ["1 张全身参考"] : [])], ...expression, poseTarget,
  };
}

export function buildCaptureInstructions(requirement: IdentityRequirement): CaptureInstruction[] {
  const target = requirement.poseTarget;
  const yawHint = target.yaw === null ? "按照参考人物方向调整头部" : Math.abs(target.yaw) < 8 ? "保持正脸角度" : target.yaw > 0 ? `向右转约 ${Math.round(Math.abs(target.yaw))}°` : `向左转约 ${Math.round(Math.abs(target.yaw))}°`;
  return [{ id: "target-pose", label: "复刻参考姿势", hint: `${yawHint} · ${requirement.expressionGuidance}`, target: "target_pose", holdMs: 2200, mouthState: requirement.mouthState }];
}

