import type { CaptureInstruction, IdentityRequirement, ReferenceAnalysis, TargetShot } from "./types";

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
      visibility: input.shot.face.visibility,
      coverage: input.shot.body.coverage,
      orientation: input.shot.body.orientation,
      hasMock,
      hasFaceCv: Boolean(hasFaceCv),
      hasHeadPoseCv: Boolean(hasHeadPoseCv),
      hasPoseCv: Boolean(hasPoseCv),
    };
  }
  return {
    mediaType: input.mediaType,
    shotType: input.shotType,
    yaw: input.face.yaw,
    visibility: input.face.visibility,
    coverage: input.body.coverage,
    orientation: input.body.orientation,
    hasMock: false,
    hasFaceCv: false,
    hasHeadPoseCv: false,
    hasPoseCv: false,
  };
}

export function planIdentityRequirement(input: ReferenceAnalysis | TargetShot): IdentityRequirement {
  const target = plannerInput(input);
  const absoluteYaw = target.yaw === null ? null : Math.abs(target.yaw);
  const needsFullBody = target.coverage === "full_body";
  const turnedBack = target.orientation === "back_three_quarter" || target.orientation === "back";
  const lowVisibility = target.visibility !== null && target.visibility < 0.55;
  const advanced = (target.shotType === "motion" && (absoluteYaw === null || absoluteYaw >= 50 || needsFullBody || turnedBack)) || lowVisibility;
  const simple = target.mediaType === "image" && target.hasFaceCv && target.hasHeadPoseCv && !target.hasMock && absoluteYaw !== null && absoluteYaw < 20 && !needsFullBody && target.orientation === "front" && target.visibility !== null && target.visibility >= 0.8;
  if (simple) return {
    mode: "simple", reason: `MediaPipe 检测到清晰正脸（偏转约 ${Math.round(absoluteYaw)}°），一张自拍就够了。`,
    basis: "cv", basisSummary: "依据 MediaPipe 人脸框、头部姿态与可见度规划",
    faceViews: ["front"], needsFullBody: false, captureDurationSeconds: 0, bestFrameCount: 1, materials: ["1 张清晰自拍"],
  };
  const turnsRight = (target.yaw ?? (target.orientation === "side" ? 35 : 0)) >= 0;
  const basis = target.hasHeadPoseCv || target.hasPoseCv ? "cv" : target.hasMock ? "fallback" : "vlm";
  const basisSummary = basis === "cv"
    ? "依据 MediaPipe 几何检测与 VLM 场景语义规划"
    : basis === "vlm" ? "几何数据不足，依据 VLM 姿态语义保守规划" : "真实分析不完整，采用安全降级规划";
  if (advanced) return {
    mode: "advanced", reason: lowVisibility ? "人物面部可见度较低，需要更多角度来补足身份信息。" : "镜头包含回头或较大动作变化，需要多角度信息来保持自然。",
    basis, basisSummary,
    faceViews: ["front", turnsRight ? "right_45" : "left_45", turnsRight ? "right_profile" : "left_profile"], needsFullBody,
    captureDurationSeconds: 9, bestFrameCount: 3, materials: ["8–10 秒多角度头部采集", ...(needsFullBody ? ["1 张全身参考"] : [])],
  };
  return {
    mode: "standard",
    reason: absoluteYaw === null ? "没有可靠的头部角度数据，因此使用多角度采集以避免误判。" : `人物存在约 ${Math.round(absoluteYaw)}° 的侧向变化，补充一个侧面角度会更像你。`,
    basis, basisSummary,
    faceViews: ["front", turnsRight ? "right_45" : "left_45"], needsFullBody,
    captureDurationSeconds: 4, bestFrameCount: 2, materials: ["3–5 秒引导式头部采集", ...(needsFullBody ? ["1 张全身参考"] : [])],
  };
}

export function buildCaptureInstructions(requirement: IdentityRequirement): CaptureInstruction[] {
  if (requirement.mode === "simple") return [{ id: "front", label: "看向镜头", hint: "保持自然表情，我们会自动拍下", target: "front", holdMs: 1200 }];
  const instructions: CaptureInstruction[] = [
    { id: "front", label: "看向镜头", hint: "让脸保持在取景框中央", target: "front", holdMs: 1400 },
    { id: "right", label: "再向右一点", hint: "慢慢转头，不需要转动身体", target: "right", holdMs: 1500 },
    { id: "hold", label: "很好，保持一下", hint: "我们正在挑选最清晰的画面", target: "right", holdMs: 1300 },
  ];
  if (requirement.mode === "advanced") instructions.splice(2, 0,
    { id: "left", label: "现在慢慢看向左边", hint: "动作放慢，会更容易捕捉", target: "left", holdMs: 1800 },
    { id: "distance", label: "稍微退后一点", hint: "让肩膀也进入取景框", target: "distance", holdMs: 1600 },
  );
  return instructions;
}
