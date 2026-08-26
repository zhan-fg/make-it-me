import type { BodyOrientation, SemanticAnalysis, SemanticAnalyzerAdapter } from "./types";

const orientations: BodyOrientation[] = ["front", "side", "back_three_quarter", "back"];

const templateMocks: Record<string, Omit<SemanticAnalysis, "provider" | "warnings">> = {
  cafe: {
    scene: { summary: "窗边咖啡馆，自然侧光与安静日常氛围", preserveRecommended: true, backgroundRegion: "室内窗边座位与桌面", lightingContext: "柔和侧光" },
    shot: { subjectPosition: "人物位于画面中央偏左", composition: "半身环境人像", cameraAngle: "平视", framing: "半身", gaze: "自然看向镜头", expression: "放松自然", poseSummary: "坐姿，身体轻微侧转", bodyOrientation: "front", interaction: "手臂靠近桌面" },
    appearance: { outfit: "日常休闲上装", hair: "自然发型" }, confidence: 0.72,
  },
  tokyo: {
    scene: { summary: "东京便利店夜景，直闪与城市霓虹氛围", preserveRecommended: true, backgroundRegion: "便利店门面与街道", lightingContext: "夜景直闪" },
    shot: { subjectPosition: "人物位于画面中央", composition: "全身环境人像", cameraAngle: "平视略低", framing: "全身", gaze: "脸转向镜头", expression: "自然克制", poseSummary: "站姿，身体微侧", bodyOrientation: "side" },
    appearance: { outfit: "城市街头穿搭", hair: "自然发型" }, confidence: 0.7,
  },
  beach: {
    scene: { summary: "海边黄昏，暖色逆光与风感", preserveRecommended: true, backgroundRegion: "海岸线与天空", lightingContext: "黄昏逆光" },
    shot: { subjectPosition: "人物位于画面右侧", composition: "全身动态环境人像", cameraAngle: "平视", framing: "全身", gaze: "回头看向镜头", expression: "自然轻松", poseSummary: "行走中回头，身体背向三分之二", bodyOrientation: "back_three_quarter", interaction: "与风和海岸环境互动" },
    appearance: { outfit: "轻盈度假穿搭", hair: "风吹动的自然发型" }, confidence: 0.7,
  },
  mirror: {
    scene: { summary: "酒店镜前，暖色室内光与松弛氛围", preserveRecommended: true, backgroundRegion: "镜面与室内空间", lightingContext: "柔和暖光" },
    shot: { subjectPosition: "人物位于画面中央", composition: "近景自拍构图", cameraAngle: "平视", framing: "近景", gaze: "看向镜面中的镜头", expression: "放松自然", poseSummary: "正面镜前自拍", bodyOrientation: "front", interaction: "手持拍摄设备" },
    appearance: { outfit: "室内休闲穿搭", hair: "自然发型" }, confidence: 0.74,
  },
  street: {
    scene: { summary: "城市街头移动跟拍，自然纪实氛围", preserveRecommended: true, backgroundRegion: "街道与城市建筑", lightingContext: "环境自然光" },
    shot: { subjectPosition: "人物位于画面中央偏右", composition: "中远景动态构图", cameraAngle: "平视", framing: "四分之三身", gaze: "转身看向镜头", expression: "自然轻松", poseSummary: "移动中转身，身体侧向", bodyOrientation: "side", interaction: "行走动作" },
    appearance: { outfit: "街头休闲穿搭", hair: "自然发型" }, confidence: 0.68,
  },
};

export function createMockSemanticAnalysis(referenceId = "uploaded", warning?: string): SemanticAnalysis {
  const preset = templateMocks[referenceId] ?? {
    scene: { summary: "参考场景（语义分析未连接）", preserveRecommended: true, backgroundRegion: "原始背景", lightingContext: "未识别" },
    shot: { subjectPosition: "人物位置待确认", composition: "人物构图", cameraAngle: "平视", framing: "半身", gaze: "自然看向镜头", expression: "自然表情", poseSummary: "人物姿态待确认", bodyOrientation: "front" as const },
    appearance: {}, confidence: 0.35,
  };
  return { ...preset, provider: "mock", warnings: ["Mock semantic analysis", ...(warning ? [warning] : [])] };
}

function isSemanticAnalysis(value: unknown): value is SemanticAnalysis {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<SemanticAnalysis>;
  return Boolean(
    result.scene && typeof result.scene.summary === "string" && typeof result.scene.preserveRecommended === "boolean" &&
    result.shot && typeof result.shot.subjectPosition === "string" && typeof result.shot.composition === "string" &&
    typeof result.shot.cameraAngle === "string" && typeof result.shot.framing === "string" && typeof result.shot.gaze === "string" &&
    typeof result.shot.expression === "string" && typeof result.shot.poseSummary === "string" &&
    orientations.includes(result.shot.bodyOrientation as BodyOrientation) && result.appearance &&
    typeof result.confidence === "number" && ["dashscope", "openai", "gemini", "mock"].includes(String(result.provider)) && Array.isArray(result.warnings)
  );
}

export const vlmSemanticAnalyzer: SemanticAnalyzerAdapter = {
  async analyze(input) {
    if (!input.image) return createMockSemanticAnalysis(input.referenceId, "没有可发送给 VLM 的代表帧");
    try {
      const accessCode = window.sessionStorage.getItem("make-it-me-access-code") || "";
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Access-Code": accessCode },
        body: JSON.stringify(input),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "VLM 请求失败";
        return createMockSemanticAnalysis(input.referenceId, message);
      }
      if (!isSemanticAnalysis(payload)) return createMockSemanticAnalysis(input.referenceId, "服务端返回未通过语义 schema 校验");
      return payload;
    } catch (error) {
      return createMockSemanticAnalysis(input.referenceId, error instanceof Error ? error.message : "VLM 请求失败");
    }
  },
};
