import type { CaptureInstruction, IdentityRequirement, ReferenceAnalysis, TargetShot } from "./types";

function plannerInput(input: ReferenceAnalysis | TargetShot) {
  if ("reference" in input) return {
    mediaType: input.reference.mediaType,
    shotType: input.shot.shotType,
    yaw: input.shot.face.yaw,
    visibility: input.shot.face.visibility,
    coverage: input.shot.body.coverage,
    orientation: input.shot.body.orientation,
  };
  return { mediaType: input.mediaType, shotType: input.shotType, yaw: input.face.yaw, visibility: input.face.visibility, coverage: input.body.coverage, orientation: input.body.orientation };
}

export function planIdentityRequirement(input: ReferenceAnalysis | TargetShot): IdentityRequirement {
  const target = plannerInput(input);
  const absoluteYaw = target.yaw === null ? 0 : Math.abs(target.yaw);
  const needsFullBody = target.coverage === "full_body";
  const advanced = target.shotType === "motion" && (absoluteYaw >= 50 || needsFullBody || target.orientation === "back_three_quarter" || target.orientation === "back");
  const simple = target.mediaType === "image" && absoluteYaw < 20 && !needsFullBody && target.orientation === "front" && (target.visibility === null || target.visibility >= 0.9);
  if (simple) return { mode: "simple", reason: "这个镜头以清晰正脸为主，一张自拍就够了。", faceViews: ["front"], needsFullBody: false, captureDurationSeconds: 0, bestFrameCount: 1, materials: ["1 张清晰自拍"] };
  const turnsRight = (target.yaw ?? (target.orientation === "side" ? 35 : 0)) >= 0;
  if (advanced) return { mode: "advanced", reason: "镜头包含回头或较大动作变化，需要多角度信息来保持自然。", faceViews: ["front", turnsRight ? "right_45" : "left_45", turnsRight ? "right_profile" : "left_profile"], needsFullBody, captureDurationSeconds: 9, bestFrameCount: 3, materials: ["8–10 秒多角度头部采集", ...(needsFullBody ? ["1 张全身参考"] : [])] };
  return { mode: "standard", reason: "人物有明显侧向姿态或动作变化，补充几个角度会更像你。", faceViews: ["front", turnsRight ? "right_45" : "left_45"], needsFullBody, captureDurationSeconds: 4, bestFrameCount: 2, materials: ["3–5 秒引导式头部采集", ...(needsFullBody ? ["1 张全身参考"] : [])] };
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
