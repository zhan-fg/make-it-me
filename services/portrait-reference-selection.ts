import type { PortraitTemplate } from "./portrait-types";

export type BaselineGender = "female" | "male";
export type BaselineView = "front" | "left" | "right" | "half" | "full";

export const baselineViewLabels: Record<BaselineView, string> = {
  front: "正面头肩",
  left: "左转约 40°",
  right: "右转约 40°",
  half: "自然站立半身",
  full: "自然站立全身",
};

export const allBaselineViews: BaselineView[] = ["front", "left", "right", "half", "full"];

export function baselineGenderForTemplate(template: PortraitTemplate): BaselineGender {
  return template.audience === "male" ? "male" : "female";
}

export function recommendedBaselineViews(template: PortraitTemplate): BaselineView[] {
  const prompt = template.prompt;
  const views: BaselineView[] = ["front"];
  if (prompt.includes("回眸") || prompt.includes("侧脸") || prompt.includes("侧身")) views.push(prompt.includes("右侧") ? "right" : "left");
  if (prompt.includes("全身") || prompt.includes("三分之二")) views.push("full");
  else if (prompt.includes("腰部以上") || prompt.includes("坐姿")) views.push("half");
  return [...new Set(views)].slice(0, 3);
}

export function baselineImagePath(gender: BaselineGender, view: BaselineView) {
  return `/baseline-models/${gender}-${view}.jpg`;
}

export function normalizeBaselineViews(value: unknown, fallback: BaselineView[]): BaselineView[] {
  if (!Array.isArray(value)) return fallback;
  const selected = value.filter((item): item is BaselineView => typeof item === "string" && allBaselineViews.includes(item as BaselineView));
  return ["front", ...selected.filter((item) => item !== "front")].slice(0, 3);
}
