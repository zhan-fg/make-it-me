import type { PortraitTemplate } from "./portrait-types";

export const portraitTemplates: PortraitTemplate[] = [
  {
    id: "warm-professional",
    title: "暖调职场肖像",
    category: "professional",
    coverImage: "/templates/warm-professional.png",
    prompt: "高级商业职场写真，暖灰摄影棚，米色西装，腰部以上构图，柔和大窗主光，克制自然的闭嘴表情。",
    selfieRequirements: ["正面清晰单人自拍", "自然闭嘴表情", "完整露出额头、耳朵和下颌"],
    tags: ["职场", "高级", "自然"], aspectRatio: "3:4",
    rights: { source: "ai-original", commercialUse: true, modelReleaseRequired: false },
  },
  {
    id: "korean-clean",
    title: "韩式清透写真",
    category: "korean",
    coverImage: "/templates/korean-clean.png",
    prompt: "韩式清透写真，明亮奶油色影棚，白色上衣，轻透自然妆容，胸像构图，柔和日光与轻微闭嘴微笑。",
    selfieRequirements: ["正面或轻微侧脸", "均匀自然光", "不要使用重度滤镜"],
    tags: ["韩式", "清透", "日光"], aspectRatio: "3:4",
    rights: { source: "ai-original", commercialUse: true, modelReleaseRequired: false },
  },
  {
    id: "new-chinese",
    title: "新中式雅韵",
    category: "new_chinese",
    coverImage: "/templates/new-chinese.png",
    prompt: "新中式高级写真，深红现代中式服装，深木色室内与纸屏风，优雅坐姿，电影感暖侧光，沉静自然表情。",
    selfieRequirements: ["清晰正脸自拍", "头发轮廓完整", "肩颈无遮挡"],
    tags: ["新中式", "电影感", "雅致"], aspectRatio: "3:4",
    rights: { source: "ai-original", commercialUse: true, modelReleaseRequired: false },
  },
];

export function getPortraitTemplate(id: string) {
  return portraitTemplates.find((template) => template.id === id);
}

