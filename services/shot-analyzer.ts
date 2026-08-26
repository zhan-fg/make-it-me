import type { TargetShot } from "./types";

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

const mockShots: Record<string, Omit<TargetShot, "id">> = {
  cafe: { shotType: "medium", mediaType: "image", scene: "窗边咖啡馆 · 自然侧光", face: { yaw: 8, pitch: -3, roll: 1, visibility: 0.98 }, body: { coverage: "upper_body", orientation: "front" }, consumerSummary: ["半身坐姿", "自然看向镜头", "脸部清晰可见"] },
  tokyo: { shotType: "full", mediaType: "image", scene: "东京便利店 · 夜景直闪", face: { yaw: 34, pitch: 1, roll: -2, visibility: 0.9 }, body: { coverage: "full_body", orientation: "side" }, consumerSummary: ["全身构图", "身体微侧", "脸转向镜头"] },
  beach: { shotType: "motion", mediaType: "video", scene: "海边黄昏 · 逆光风感", face: { yaw: 58, pitch: -4, roll: 3, visibility: 0.86 }, body: { coverage: "full_body", orientation: "back_three_quarter" }, consumerSummary: ["全身回头动作", "脸部角度变化较大", "需要保持人物比例"] },
  mirror: { shotType: "close_up", mediaType: "image", scene: "酒店镜前 · 室内暖光", face: { yaw: 12, pitch: 5, roll: -4, visibility: 0.94 }, body: { coverage: "face", orientation: "front" }, consumerSummary: ["近距离自拍", "正脸为主", "脸部无遮挡"] },
  street: { shotType: "motion", mediaType: "video", scene: "城市街头 · 移动跟拍", face: { yaw: 47, pitch: 0, roll: 2, visibility: 0.82 }, body: { coverage: "three_quarter", orientation: "side" }, consumerSummary: ["移动中转身", "中远景构图", "需要多个脸部角度"] },
};

export const shotAnalyzer = {
  async analyze(referenceId = "uploaded", mediaType: "image" | "video" = "image"): Promise<TargetShot> {
    await wait(1100);
    const preset = mockShots[referenceId] ?? {
      ...mockShots.cafe,
      mediaType,
      shotType: mediaType === "video" ? "motion" as const : "medium" as const,
      consumerSummary: mediaType === "video" ? ["人物有轻微转头", "以上半身为主", "需要多个清晰角度"] : ["半身构图", "人物微侧", "脸部清晰可见"],
    };
    return { id: `shot-${Date.now()}`, ...preset };
  },
};
