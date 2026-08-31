import type { PortraitRetouchSettings, PortraitTemplate } from "./portrait-types";

export type PortraitPromptMode = "template" | "user";
export type PortraitPromptOptions = { beautyLevel?: number; retouchSettings?: PortraitRetouchSettings; identityReferenceCount?: number };

type PhotographySpec = {
  framing: string;
  subjectScale: string;
  placement: string;
  orientation: string;
  camera: string;
  lighting: string;
  pose: string;
  editorialStyle: string;
};

function photographySpec(template: PortraitTemplate): PhotographySpec {
  const description = template.prompt;
  const isIdPhoto = template.category === "id_photo";
  const framing = isIdPhoto ? "标准头肩证件照" : description.includes("全身") ? "全身或三分之二全身" : description.includes("三分之二") ? "三分之二全身" : description.includes("腰部以上") ? "腰部以上半身" : description.includes("胸像") ? "胸像" : "腰部以上至三分之二全身";
  const subjectScale = isIdPhoto ? "头顶至肩部占画面高度 58%–68%" : framing.includes("全身") ? "人物占画面高度 82%–90%，完整保留头顶和脚部" : framing === "胸像" ? "人物占画面高度 60%–70%" : framing.includes("腰部以上") ? "人物占画面高度 68%–78%" : "人物占画面高度 74%–86%";
  const placement = isIdPhoto ? "人物严格水平居中，双眼位于画面上方约 38%，头顶留白 7%–10%，双肩左右安全边距一致" : "优先使用三分法、对角线或环境式构图，人物面部位于视觉交点附近；根据视线和身体朝向保留空间，允许自然偏心，禁止标准证件照式正中对称构图";
  const orientation = isIdPhoto ? "身体、肩线和脸部正对镜头，头部保持垂直，双眼直视镜头" : description.includes("回眸") ? "身体按写真方案转向，脸部自然回看镜头，颈部不得扭曲" : description.includes("侧脸") || description.includes("侧身") ? "身体与脸部按写真方案形成自然侧向角度，双肩透视和视线方向一致" : "身体方向、脸部方向和视线必须协调，肩颈放松，禁止不自然歪头和关节扭曲";
  const camera = isIdPhoto ? "相机与双眼等高，水平拍摄，使用约 85mm 人像镜头视角，禁止广角透视和俯仰畸变" : framing.includes("全身") ? "相机位于胸口至腰部高度，使用约 50–70mm 视角，保持垂直线和人体比例自然" : "相机位于眼睛至胸口高度，使用约 70–105mm 人像视角，保持自然透视与适度背景压缩";
  const lighting = isIdPhoto ? "正面大型柔光，面部照度均匀，背景纯净，左右亮度平衡，无明显鼻影、眼窝阴影和背景阴影" : "严格遵循写真方案的主光方向和色温；主光、环境光、轮廓光必须符合同一空间关系，面部与身体曝光一致，人物投影方向与背景一致";
  const pose = isIdPhoto ? "正面平肩、身体稳定、双手不入镜" : description.includes("行走") ? "捕捉自然迈步瞬间，前后脚形成层次，手臂随步态自然摆动，衣摆和头发有轻微动态" : description.includes("坐姿") ? "身体斜向画面坐下，双肩形成自然高低差，手部与座椅、衣料或随身物自然互动，禁止双手僵硬并排" : description.includes("回眸") ? "身体先转离镜头，再由肩颈带动自然回眸，肩线、腰线和视线形成连续方向" : description.includes("侧身") || description.includes("侧脸") ? "身体与镜头形成约 30–60 度夹角，一侧肩膀更靠近镜头，重心落在一侧，手部自然参与造型" : "身体与镜头形成约 15–45 度夹角，肩线避免水平对称，重心自然落在一侧；至少一只手与服装、头发、椅背或场景物件产生自然互动";
  const editorialStyle = isIdPhoto ? "规范、克制、可用于正式证件" : description.includes("电影") || description.includes("港风") ? "电影剧照式叙事瞬间，画面应有动作发生前后的感觉，不看起来像棚拍登记照" : description.includes("旅拍") || description.includes("海边") || description.includes("草原") || description.includes("都市") ? "环境人像与旅行杂志语言，人物和场景共同叙事，保留足够环境空间与自然动态" : description.includes("杂志") || description.includes("礼服") ? "高端时装杂志大片语言，姿态有设计感但不僵硬，构图具有视觉张力" : "专业写真摄影语言，采用自然瞬间、非对称姿态和有层次的环境关系，禁止证件照、员工头像或普通登记照观感";
  return { framing, subjectScale, placement, orientation, camera, lighting, pose, editorialStyle };
}

function beautyRule(template: PortraitTemplate, value: number) {
  if (template.category === "id_photo") return "证件照固定为轻度精修：仅轻微均匀肤色、减弱明显痘印黑眼圈和泛红，保留毛孔、痣、脸型、五官比例与真实身份；不得瘦脸、大眼、改变发型或过度美白。";
  if (value <= 20) return "美颜强度为轻微：只校正肤色、曝光和明显临时瑕疵，完整保留毛孔、面部轮廓和自然皮肤状态，不瘦脸。";
  if (value <= 45) return "美颜强度为自然：均匀肤色、减弱痘印黑眼圈和泛红、轻微磨皮提亮，完整保留真实皮肤纹理和面部结构，不大眼。";
  if (value <= 70) return "美颜强度为商业精修：去除明显痘印黑眼圈和泛红、适度磨皮提亮、增加自然皮肤光泽、轻微收紧面颊与下颌；保留真实纹理，不大眼，不改变鼻子和嘴唇。";
  return "美颜强度为明显精修：充分均匀肤色和磨皮提亮、清除明显瑕疵、增强自然皮肤光泽、适度收紧面颊与下颌，但必须保持可识别身份、真实皮肤质感和自然骨骼；不大眼、不改变鼻子嘴唇、不制造塑料皮肤。";
}

function clamp(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}

function detailedRetouchRule(template: PortraitTemplate, settings?: PortraitRetouchSettings) {
  if (!settings) return undefined;
  if (template.category === "id_photo") return "证件照安全限制覆盖客户设置：磨皮、提亮和祛瑕仅允许轻度；禁止美白改变原始肤色，禁止瘦脸、大眼、鼻型调整和明显妆容，必须保持原始发型与真实身份。";
  const values = {
    skinSmoothing: clamp(settings.skinSmoothing, 100),
    whitening: clamp(settings.whitening, 100),
    blemishRemoval: clamp(settings.blemishRemoval, 100),
    faceSlimming: clamp(settings.faceSlimming, 100),
    eyeEnlargement: clamp(settings.eyeEnlargement, 100),
    noseRefinement: clamp(settings.noseRefinement, 100),
    skinGlow: clamp(settings.skinGlow, 100),
    makeupIntensity: clamp(settings.makeupIntensity, 100),
  };
  return [
    "按以下客户美颜参数分别执行，不得擅自联动放大其他项目：",
    `磨皮 ${values.skinSmoothing}/100：降低粗糙与细小纹理，但保留足够毛孔和真实皮肤层次。`,
    `美白 ${values.whitening}/100：提升通透度与明度，保持人物原始肤色倾向，禁止漂白、过曝和脸颈色差。`,
    `祛瑕 ${values.blemishRemoval}/100：减弱痘印、黑眼圈、泛红和临时瑕疵，保留痣及可识别特征。`,
    `瘦脸 ${values.faceSlimming}/100：只收紧面颊和下颌软组织，保持颧骨、下颌骨、脸长和头部比例，禁止明显骨骼重塑。`,
    `大眼 ${values.eyeEnlargement}/100：仅在自然范围轻微放大眼裂和提升精神感，保持眼距、眼型、瞳孔比例和双眼对称。`,
    `鼻型 ${values.noseRefinement}/100：仅轻微优化鼻翼、鼻梁和鼻尖的视觉精致度，保持原始鼻部识别特征和透视。`,
    `皮肤光泽 ${values.skinGlow}/100：增加自然水润高光和通透感，禁止油腻反光、金属质感和塑料皮肤。`,
    `妆容 ${values.makeupIntensity}/100：匹配写真主题添加适度底妆、眉眼、腮红和唇色，保持五官真实，不使用夸张舞台妆。`,
  ].join("\n");
}

export function buildPortraitPrompt(template: PortraitTemplate, mode: PortraitPromptMode, options: PortraitPromptOptions = {}) {
  const spec = photographySpec(template);
  const beautyLevel = Math.max(0, Math.min(100, Math.round(options.beautyLevel ?? 55)));
  const retouchRule = detailedRetouchRule(template, options.retouchSettings) || `美颜参数：${beautyLevel}/100。${beautyRule(template, beautyLevel)}`;
  const referenceCount = Math.max(1, Math.round(options.identityReferenceCount || 1));
  const identity = mode === "template" && referenceCount > 1
    ? `输入的 ${referenceCount} 张照片均为同一个指定基准模特的不同角度或景别，只能共同用于还原同一个人物身份、脸部结构和身体比例，不得把各图融合成不同人物`
    : mode === "template" ? "图1是指定的基准模特自拍，也是唯一的人物身份来源" : "图1是用户自拍，也是唯一的人物身份来源";
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
    `8. 姿势与互动：${spec.pose}；肩颈放松，手指自然，禁止多余肢体、关节反折、手脚缺失、裁切关节和不符合重力的动作。`,
    `9. 摄影叙事：${spec.editorialStyle}。`,
    "10. 成片质感：超写实真人摄影，呈现真实皮肤纹理、自然独立发丝、准确人体结构、真实布料材质和符合物理规律的光影；禁止插画、CG、游戏建模、蜡像和塑料皮肤。",
    appearanceRule,
    stylingRule,
    retouchRule,
    "头发、脸部、颈部、身体和服装必须属于同一个人，不得创造或融合第二个人物身份；禁止换脸拼贴、双重发型、多余人物、文字、品牌标志和水印。",
    "只输出一张最终写真照片。",
  ].join("\n");
}
