import type { CaptureInstruction, IdentityRequirement, TargetShot } from "./types";

export function planIdentityRequirement(target: TargetShot): IdentityRequirement {
  const absoluteYaw = Math.abs(target.face.yaw);
  const needsFullBody = target.body.coverage === "full_body";
  const advanced = target.shotType === "motion" && (absoluteYaw >= 50 || needsFullBody || target.body.orientation === "back_three_quarter");
  const simple = target.mediaType === "image" && absoluteYaw < 20 && !needsFullBody && target.face.visibility >= 0.9;
  if (simple) return { mode: "simple", reason: "这个镜头以清晰正脸为主，一张自拍就够了。", faceViews: ["front"], needsFullBody: false, captureDurationSeconds: 0, bestFrameCount: 1, materials: ["1 张清晰自拍"] };
  if (advanced) return { mode: "advanced", reason: "镜头包含回头或较大角度变化，需要多角度信息来保持自然。", faceViews: ["front", target.face.yaw >= 0 ? "right_45" : "left_45", target.face.yaw >= 0 ? "right_profile" : "left_profile"], needsFullBody, captureDurationSeconds: 9, bestFrameCount: 3, materials: ["8–10 秒多角度头部采集", ...(needsFullBody ? ["1 张全身参考"] : [])] };
  return { mode: "standard", reason: "人物有明显侧脸或动作变化，补充几个角度会更像你。", faceViews: ["front", target.face.yaw >= 0 ? "right_45" : "left_45"], needsFullBody, captureDurationSeconds: 4, bestFrameCount: 2, materials: ["3–5 秒引导式头部采集", ...(needsFullBody ? ["1 张全身参考"] : [])] };
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
