import type { PortraitTemplate } from "./portrait-types";

export type PortraitPromptMode = "template" | "user";
export type PortraitPromptOptions = { beautyLevel?: number };

type PhotographySpec = {
  framing: string;
  subjectScale: string;
  placement: string;
  orientation: string;
  camera: string;
  lighting: string;
};

function photographySpec(template: PortraitTemplate): PhotographySpec {
  const description = template.prompt;
  const isIdPhoto = template.category === "id_photo";
  const framing = isIdPhoto ? "标准头肩证件照" : description.includes("全身") ? "全身或三分之二全身" : description.includes("三分之二") ? "三分之二全身" : description.includes("腰部以上") ? "腰部以上半身" : description.includes("胸像") ? "胸像" : "腰部以上至三分之二全身";
  const subjectScale = isIdPhoto ? "头顶至肩部占画面高度 58%–68%" : framing.includes("全身") ? "人物占画面高度 82%–90%，完整保留头顶和脚部" : framing === "胸像" ? "人物占画面高度 60%–70%" : framing.includes("腰部以上") ? "人物占画面高度 68%–78%" : "人物占画面高度 74%–86%";
  const placement = isIdPhoto ? "人物严格水平居中，双眼位于画面上方约 38%，头顶留白 7%–10%，双肩左右安全边距一致" : description.includes("偏心") ? "允许按写真方案偏离中心，但面部必须位于三分法视觉交点，视线方向保留空间，人物不得贴边" : "人物视觉中心位于画面水平中线附近，头顶留白 6%–10%，身体和四肢不得被画框错误截断";
  const orientation = isIdPhoto ? "身体、肩线和脸部正对镜头，头部保持垂直，双眼直视镜头" : description.includes("回眸") ? "身体按写真方案转向，脸部自然回看镜头，颈部不得扭曲" : description.includes("侧脸") || description.includes("侧身") ? "身体与脸部按写真方案形成自然侧向角度，双肩透视和视线方向一致" : "身体方向、脸部方向和视线必须协调，肩颈放松，禁止不自然歪头和关节扭曲";
  const camera = isIdPhoto ? "相机与双眼等高，水平拍摄，使用约 85mm 人像镜头视角，禁止广角透视和俯仰畸变" : framing.includes("全身") ? "相机位于胸口至腰部高度，使用约 50–70mm 视角，保持垂直线和人体比例自然" : "相机位于眼睛至胸口高度，使用约 70–105mm 人像视角，保持自然透视与适度背景压缩";
  const lighting = isIdPhoto ? "正面大型柔光，面部照度均匀，背景纯净，左右亮度平衡，无明显鼻影、眼窝阴影和背景阴影" : "严格遵循写真方案的主光方向和色温；主光、环境光、轮廓光必须符合同一空间关系，面部与身体曝光一致，人物投影方向与背景一致";
  return { framing, subjectScale, placement, orientation, camera, lighting };
}

function beautyRule(template: PortraitTemplate, value: number) {
  if (template.category === "id_photo") return "证件照固定为轻度精修：仅轻微均匀肤色、减弱明显痘印黑眼圈和泛红，保留毛孔、痣、脸型、五官比例与真实身份；不得瘦脸、大眼、改变发型或过度美白。";
  if (value <= 20) return "美颜强度为轻微：只校正肤色、曝光和明显临时瑕疵，完整保留毛孔、面部轮廓和自然皮肤状态，不瘦脸。";
  if (value <= 45) return "美颜强度为自然：均匀肤色、减弱痘印黑眼圈和泛红、轻微磨皮提亮，完整保留真实皮肤纹理和面部结构，不大眼。";
  if (value <= 70) return "美颜强度为商业精修：去除明显痘印黑眼圈和泛红、适度磨皮提亮、增加自然皮肤光泽、轻微收紧面颊与下颌；保留真实纹理，不大眼，不改变鼻子和嘴唇。";
  return "美颜强度为明显精修：充分均匀肤色和磨皮提亮、清除明显瑕疵、增强自然皮肤光泽、适度收紧面颊与下颌，但必须保持可识别身份、真实皮肤质感和自然骨骼；不大眼、不改变鼻子嘴唇、不制造塑料皮肤。";
}

export function buildPortraitPrompt(template: PortraitTemplate, mode: PortraitPromptMode, options: PortraitPromptOptions = {}) {
  const spec = photographySpec(template);
  const beautyLevel = Math.max(0, Math.min(100, Math.round(options.beautyLevel ?? 55)));
  const identity = mode === "template" ? "图1是指定的基准模特自拍，也是唯一的人物身份来源" : "图1是用户自拍，也是唯一的人物身份来源";
  const appearanceRule = template.category === "id_photo"
    ? "证件照必须原样保留图1人物的脸型、骨骼、五官比例、发型、发际线、头发长度和真实身份；不得瘦脸、改变脸型、改变发型、增加发量、添加明显妆容或制造写真姿势。"
    : "根据写真方案生成服装、妆容方向、发型风格和姿势；人物身份必须完全来自图1，并根据该人物自然适配头发、肩颈和身体比例。";
  const stylingRule = template.category === "id_photo"
    ? "保持图1原始发型、发际线、头发长度和脸型，只匹配规范纯色背景、服装和均匀证件照光线。"
    : "由专业造型师根据图1人物的脸型、五官、发际线、头发条件、年龄气质和写真方案，匹配自然且适合本人的发型、妆容与服装；背景根据人物肤色、服装色彩和模板主题匹配，确保色温、明度、对比度和空间层次衬托人物，不得使用与人物气质冲突的发型或背景。";

  return [
    `你是一名专业人像摄影师、灯光师和高端商业修图师。${identity}。使用图1人物完成一张全新的竖版专业写真。`,
    `写真创意方案：${template.prompt}`,
    "专业摄影执行规范（优先级高于模型自由发挥）：",
    `1. 景别：${spec.framing}。`,
    `2. 人物比例：${spec.subjectScale}。`,
    `3. 画面位置与裁切：${spec.placement}。`,
    `4. 身体、脸部与视线方向：${spec.orientation}。`,
    `5. 相机与镜头：${spec.camera}。`,
    `6. 灯光：${spec.lighting}。`,
    "7. 环境融合：人物与背景的曝光、白平衡、色温、光源方向、接触阴影、空气透视、锐度和景深必须统一，禁止人物像后期贴入背景。",
    "8. 姿势：肩颈放松，重心稳定，手臂和手指自然；禁止多余肢体、关节反折、手脚缺失、裁切关节和不符合重力的动作。",
    "9. 成片质感：超写实真人摄影，呈现真实皮肤纹理、自然独立发丝、准确人体结构、真实布料材质和符合物理规律的光影；禁止插画、CG、游戏建模、蜡像和塑料皮肤。",
    appearanceRule,
    stylingRule,
    `美颜参数：${beautyLevel}/100。${beautyRule(template, beautyLevel)}`,
    "头发、脸部、颈部、身体和服装必须属于同一个人，不得创造或融合第二个人物身份；禁止换脸拼贴、双重发型、多余人物、文字、品牌标志和水印。",
    "只输出一张最终写真照片。",
  ].join("\n");
}
