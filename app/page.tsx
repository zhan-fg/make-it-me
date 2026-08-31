"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconCheck, IconDownload, IconRefresh, IconSparkles, IconUpload } from "@tabler/icons-react";
import { portraitTemplates } from "@/services/portrait-templates";
import type { PortraitGenerationResult, PortraitRetouchSettings, PortraitTemplate } from "@/services/portrait-types";
import { baselineGenderForTemplate, baselineImagePath, baselineViewLabels, recommendedBaselineViews } from "@/services/portrait-reference-selection";

type Step = "templates" | "selfie" | "generating" | "result";
type Selfie = { previewUrl: string; blob: Blob; width: number; height: number; name: string; originalBytes: number; uploadBytes: number };
const defaultRetouchSettings: PortraitRetouchSettings = { skinSmoothing: 100, whitening: 100, blemishRemoval: 100, faceSlimming: 100, eyeEnlargement: 100, noseRefinement: 100, skinGlow: 100, makeupIntensity: 100 };

function formatBytes(value: number) {
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(value / 1024))}KB`;
}

async function readApiPayload(response: Response, label: string) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`${label}返回了非 JSON 响应（HTTP ${response.status}），请检查最新 Vercel 部署与函数日志`); }
}

async function prepareSelfie(file: File): Promise<Selfie> {
  if (!file.type.startsWith("image/")) throw new Error("请选择 JPEG、PNG 或 WebP 图片");
  if (file.size > 12 * 1024 * 1024) throw new Error("自拍图片不能超过 12MB");
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = () => reject(new Error("无法读取自拍图片")); value.src = source; });
    if (Math.min(image.naturalWidth, image.naturalHeight) < 640) throw new Error("自拍分辨率过低，短边至少需要 640px");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法压缩图片");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = .92;
    let blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片压缩失败")), "image/jpeg", quality));
    while (blob.size > 1_600_000 && quality > .84) {
      quality -= .02;
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片压缩失败")), "image/jpeg", quality));
    }
    if (blob.size > 2_000_000) throw new Error("自拍在保持高画质后仍超过 2MB，请选择尺寸稍小的原图");
    return { previewUrl: URL.createObjectURL(blob), blob, width: image.naturalWidth, height: image.naturalHeight, name: file.name, originalBytes: file.size, uploadBytes: blob.size };
  } finally { URL.revokeObjectURL(source); }
}

export default function Home() {
  const [step, setStep] = useState<Step>("templates");
  const [template, setTemplate] = useState<PortraitTemplate>();
  const [selfie, setSelfie] = useState<Selfie>();
  const [result, setResult] = useState<PortraitGenerationResult>();
  const [error, setError] = useState<string>();
  const [retouchSettings, setRetouchSettings] = useState<PortraitRetouchSettings>(defaultRetouchSettings);
  const [publishedCovers, setPublishedCovers] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { fetch("/api/template-covers", { cache: "no-store" }).then((response) => response.json()).then((value) => setPublishedCovers(value.covers || {})).catch(() => undefined); }, []);
  const clearSelfie = () => { if (selfie) URL.revokeObjectURL(selfie.previewUrl); setSelfie(undefined); };
  const reset = () => { clearSelfie(); setStep("templates"); setTemplate(undefined); setResult(undefined); setError(undefined); };
  const choose = (value: PortraitTemplate) => { clearSelfie(); setTemplate(value); setResult(undefined); setError(undefined); setStep("selfie"); };
  const pick = async (file?: File) => { if (!file) return; try { setError(undefined); const prepared = await prepareSelfie(file); clearSelfie(); setSelfie(prepared); } catch (reason) { clearSelfie(); setError(reason instanceof Error ? reason.message : "自拍检查失败"); } if (input.current) input.current.value = ""; };
  const generate = async () => {
    if (!template || !selfie) return; setError(undefined); setStep("generating");
    const requestStartedAt = performance.now();
    try {
      const uploadStartedAt = performance.now();
      const uploadResponse = await fetch("/api/image-upload", { method: "POST", headers: { "Content-Type": selfie.blob.type }, body: selfie.blob });
      const uploadPayload = await readApiPayload(uploadResponse, "自拍上传接口");
      if (!uploadResponse.ok) throw new Error(uploadPayload.error || "自拍上传失败");
      const selfieUploadMs = performance.now() - uploadStartedAt;
      const response = await fetch("/api/portrait-generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: template.id, selfieImageUrl: uploadPayload.url, retouchSettings }) });
      const payload = await readApiPayload(response, "写真生成接口");
      const clientRoundTripMs = performance.now() - requestStartedAt;
      if (!response.ok) throw new Error(`${payload.error || "写真生成失败"}（总耗时 ${(clientRoundTripMs / 1000).toFixed(1)} 秒${payload.requestId ? `，追踪号 ${payload.requestId}` : ""}）`);
      payload.timings = { ...payload.timings, selfieUploadMs: Math.round(selfieUploadMs), clientRoundTripMs: Math.round(clientRoundTripMs) };
      setResult(payload); setStep("result");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "写真生成失败"); setStep("selfie"); }
  };
  return <main className="min-h-screen bg-[#efede9] text-[#211f1d]">
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => pick(event.target.files?.[0])}/>
    <header className="mx-auto flex h-20 max-w-6xl items-center px-5"><button onClick={reset} className="flex items-center gap-2 text-lg font-semibold"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#201e1c] text-white"><IconSparkles size={17}/></span>Make it me</button><span className="ml-auto rounded-full bg-white/70 px-3 py-1.5 text-xs">AI 写真内测</span></header>
    {step === "templates" && <Gallery choose={choose} publishedCovers={publishedCovers}/>}
    {step === "selfie" && template && <SelfiePage template={template} selfie={selfie} error={error} retouchSettings={retouchSettings} setRetouchSettings={setRetouchSettings} back={() => setStep("templates")} pick={() => input.current?.click()} generate={generate}/>}
    {step === "generating" && template && <Loading template={template}/>}
    {step === "result" && template && result && <Result template={template} result={result} again={() => setStep("selfie")} reset={reset}/>}
  </main>;
}

function Gallery({ choose, publishedCovers }: { choose: (template: PortraitTemplate) => void; publishedCovers: Record<string, string> }) {
  const audienceLabels: Record<PortraitTemplate["audience"], string> = { female: "女性形象", male: "男性形象", unisex: "男女通用" };
  const categories: { id: "all" | PortraitTemplate["category"]; label: string }[] = [
    { id: "all", label: "全部" }, { id: "professional", label: "职场" }, { id: "korean", label: "韩式" },
    { id: "japanese", label: "日系" }, { id: "retro", label: "复古" }, { id: "bridal", label: "礼服" },
    { id: "new_chinese", label: "东方" }, { id: "hong_kong", label: "港风" }, { id: "french", label: "法式" },
    { id: "outdoor", label: "户外" }, { id: "seasonal", label: "四季" }, { id: "travel", label: "旅拍" },
    { id: "art", label: "艺术" }, { id: "mens", label: "男士" }, { id: "id_photo", label: "证件照" },
  ];
  const [category, setCategory] = useState<(typeof categories)[number]["id"]>("all");
  const visibleTemplates = category === "all" ? portraitTemplates : portraitTemplates.filter((item) => item.category === category);
  return <div className="mx-auto max-w-6xl px-5 pb-20"><section className="py-10 text-center sm:py-16"><span className="text-xs tracking-[.2em] text-[#806252]">PORTRAIT STUDIO</span><h1 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-6xl">一张自拍，生成你的写真</h1><p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#716c67]">从 {portraitTemplates.length} 套原创写真中选择风格。形象标签仅作提示，不限制选择。</p></section><div className="mb-7 flex gap-2 overflow-x-auto pb-2">{categories.map((item) => <button key={item.id} onClick={() => setCategory(item.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm transition ${category === item.id ? "bg-[#201e1c] text-white" : "bg-white text-[#625d58] hover:bg-[#e4dfd9]"}`}>{item.label}</button>)}</div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visibleTemplates.map((item) => { const coverImage = publishedCovers[item.id] || item.coverImage; return <button key={item.id} onClick={() => choose({ ...item, coverImage })} className="group overflow-hidden rounded-[28px] bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className="relative aspect-[3/4] overflow-hidden"><img src={coverImage} alt={item.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"/><span className="absolute left-4 top-4 rounded-full bg-black/65 px-3 py-1.5 text-[11px] text-white backdrop-blur">{audienceLabels[item.audience]}</span></div><div className="p-5"><h2 className="text-lg font-semibold">{item.title}</h2><div className="mt-3 flex gap-2">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-[#f3f0ec] px-2.5 py-1 text-[11px]">{tag}</span>)}</div></div></button>; })}</div><p className="mt-8 text-center text-xs text-[#8b8580]">模板均为 AI 原创合成人像，不使用网络抓取图片。</p></div>;
}

function SelfiePage({ template, selfie, error, retouchSettings, setRetouchSettings, back, pick, generate }: { template: PortraitTemplate; selfie?: Selfie; error?: string; retouchSettings: PortraitRetouchSettings; setRetouchSettings: (value: PortraitRetouchSettings) => void; back: () => void; pick: () => void; generate: () => void }) {
  return <div className="mx-auto max-w-5xl px-5 pb-20"><button onClick={back} className="mt-5 flex items-center gap-2 text-sm"><IconArrowLeft size={16}/>重新选择模板</button><div className="mt-7 grid gap-7 lg:grid-cols-2"><section><img src={template.coverImage} alt={template.title} className="aspect-[3/4] w-full rounded-[28px] object-cover"/><h2 className="mt-4 text-xl font-semibold">{template.title}</h2><p className="mt-2 text-sm leading-6 text-[#716c67]">{template.prompt}</p></section><section className="rounded-[28px] bg-white p-6 sm:p-8"><span className="text-xs tracking-[.15em] text-[#806252]">YOUR SELFIE</span><h1 className="mt-3 text-3xl font-semibold">上传一张清晰自拍</h1><div className="mt-5 space-y-3">{template.selfieRequirements.map((item) => <div key={item} className="flex items-center gap-3 text-sm"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#e9f4dd]"><IconCheck size={14}/></span>{item}</div>)}</div><CaptureExamples template={template}/>{selfie ? <div className="mt-6"><img src={selfie.previewUrl} alt="用户自拍" className="aspect-[3/4] w-full rounded-2xl object-cover"/><p className="mt-2 text-xs text-[#746e69]">{selfie.name} · {selfie.width} × {selfie.height}</p><p className="mt-2 rounded-xl bg-[#eef7e8] px-3 py-2 text-xs text-[#52703d]">高画质等比压缩：{formatBytes(selfie.originalBytes)} → {formatBytes(selfie.uploadBytes)}</p><button onClick={pick} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f2efeb] py-3 text-sm"><IconRefresh size={16}/>更换自拍</button></div> : <button onClick={pick} className="mt-7 grid aspect-[4/3] w-full place-items-center rounded-2xl border border-dashed bg-[#f8f6f3]"><span className="text-center"><IconUpload className="mx-auto"/><b className="mt-3 block text-sm">选择自拍照片</b><small className="mt-1 block text-[#837c76]">短边至少 640px，高画质等比压缩</small></span></button>}<BeautyControls disabled={template.category === "id_photo"} value={retouchSettings} onChange={setRetouchSettings}/>{error && <div role="alert" className="mt-4 rounded-2xl bg-[#fff0ed] p-4 text-sm text-[#963b31]"><b>真实生成失败</b><p className="mt-1">{error}</p><p className="mt-2 text-xs">没有使用 Mock 图片。</p></div>}<button disabled={!selfie} onClick={generate} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#201e1c] py-4 text-white disabled:opacity-35"><IconSparkles size={18}/>生成我的写真</button><p className="mt-4 text-center text-[11px] text-[#8d8680]">自拍仅临时上传用于本次生成，生成接口只传递图片 URL。</p></section></div></div>;
}

function CaptureExamples({ template }: { template: PortraitTemplate }) {
  const gender = baselineGenderForTemplate(template);
  const views = recommendedBaselineViews(template);
  return <section className="mt-6 rounded-2xl bg-[#f6f2ee] p-4"><div className="flex items-center justify-between"><b className="text-sm">按这些示例拍摄</b><span className="text-[10px] text-[#806252]">当前模板推荐</span></div><p className="mt-1 text-xs leading-5 text-[#746e69]">保持自然光、无遮挡和真实比例。正面照帮助保持本人身份，角度或身体示例帮助还原模板姿势。</p><div className={`mt-3 grid gap-2 ${views.length === 1 ? "grid-cols-1" : views.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>{views.map((view) => <figure key={view} className="overflow-hidden rounded-xl bg-white"><img src={baselineImagePath(gender, view)} alt={baselineViewLabels[view]} className="aspect-[3/4] w-full object-cover"/><figcaption className="px-2 py-2 text-center text-[10px]">{baselineViewLabels[view]}</figcaption></figure>)}</div></section>;
}

function BeautyControls({ value, onChange, disabled }: { value: PortraitRetouchSettings; onChange: (value: PortraitRetouchSettings) => void; disabled: boolean }) {
  const controls: Array<[keyof PortraitRetouchSettings, string, string]> = [
    ["skinSmoothing", "磨皮", "降低粗糙，保留真实纹理"], ["whitening", "美白", "通透提亮，不改变原始肤色"],
    ["blemishRemoval", "祛瑕", "痘印、黑眼圈与泛红"], ["faceSlimming", "瘦脸", "收紧面颊和下颌"],
    ["eyeEnlargement", "大眼", "自然放大，保持眼型眼距"], ["noseRefinement", "鼻型", "轻微优化鼻翼、鼻梁与鼻尖"],
    ["skinGlow", "皮肤光泽", "增加自然水润通透感"], ["makeupIntensity", "妆容", "匹配写真主题的妆容强度"],
  ];
  return <div className="mt-6 rounded-2xl bg-[#f6f2ee] p-4"><div className="flex items-center justify-between"><b className="text-sm">高级美颜</b>{disabled && <span className="text-xs text-[#8c6558]">证件照固定轻度</span>}</div><div className="mt-4 grid gap-4 sm:grid-cols-2">{controls.map(([key, label, hint]) => <label key={key} className="block"><span className="flex items-center justify-between text-xs"><b>{label}</b><span>{disabled ? key === "skinSmoothing" || key === "blemishRemoval" || key === "whitening" ? 20 : 0 : value[key]}</span></span><input disabled={disabled} type="range" min="0" max="100" step="5" value={disabled ? key === "skinSmoothing" || key === "blemishRemoval" || key === "whitening" ? 20 : 0 : value[key]} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} className="mt-2 w-full accent-[#806252] disabled:opacity-40"/><span className="mt-1 block text-[10px] leading-4 text-[#847c75]">{hint}</span></label>)}</div><p className="mt-4 text-xs leading-5 text-[#7d756f]">AI 还会根据脸型、发际线、年龄气质和模板风格匹配发型，并根据肤色、服装和主题匹配背景。五官调整过高可能降低本人相似度。</p></div>;
}

function Loading({ template }: { template: PortraitTemplate }) { return <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-5 text-center"><div><img src={template.coverImage} alt={template.title} className="mx-auto aspect-[3/4] w-56 animate-pulse rounded-[28px] object-cover opacity-60"/><IconSparkles className="mx-auto mt-7 animate-pulse"/><h1 className="mt-4 text-2xl font-semibold">正在生成你的写真</h1><p className="mt-3 text-sm leading-6 text-[#746e69]">正在保持你的身份，并重建模板的妆造、服装、光线与场景。请不要关闭页面。</p></div></div>; }

function Result({ template, result, again, reset }: { template: PortraitTemplate; result: PortraitGenerationResult; again: () => void; reset: () => void }) {
  const timingItems = [
    ["自拍上传", result.timings.selfieUploadMs || 0],
    ["网络与浏览器", Math.max(0, (result.timings.clientRoundTripMs || result.timings.serverTotalMs) - result.timings.serverTotalMs - (result.timings.selfieUploadMs || 0))],
    ["请求解析", result.timings.requestParseMs], ["自拍读取", result.timings.templateLoadMs],
    ["Gemini 生成", result.timings.geminiMs], ["结果解析", result.timings.responseParseMs], ["结果存储", result.timings.resultStorageMs],
  ] as const;
  return <div className="mx-auto max-w-5xl px-5 pb-20"><div className="py-8 text-center"><span className="text-xs tracking-[.15em] text-[#806252]">PORTRAIT READY</span><h1 className="mt-3 text-4xl font-semibold">这是你的写真</h1><p className="mt-3 text-sm text-[#746e69]">{result.model} · 浏览器总耗时 {((result.timings.clientRoundTripMs || result.elapsedMs) / 1000).toFixed(1)} 秒</p></div><div className="grid gap-5 sm:grid-cols-2"><img src={template.coverImage} alt="写真模板" className="aspect-[3/4] w-full rounded-[28px] object-cover"/><img src={result.imageUrl} alt="生成写真" className="aspect-[3/4] w-full rounded-[28px] bg-white object-cover"/></div><p className="mt-3 flex justify-center gap-2 text-sm"><IconCheck size={16}/>Gemini 真实生成</p><section className="mx-auto mt-6 max-w-2xl rounded-2xl bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">生成耗时分析</h2><span className="text-xs text-[#807973]">服务端 {(result.timings.serverTotalMs / 1000).toFixed(1)} 秒</span></div><div className="mt-4 grid gap-3 sm:grid-cols-5">{timingItems.map(([label, value]) => <div key={label} className="rounded-xl bg-[#f5f2ee] p-3"><p className="text-[11px] text-[#7e7771]">{label}</p><p className="mt-1 font-semibold">{value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`}</p></div>)}</div>{result.requestId && <p className="mt-3 text-[11px] text-[#918a84]">追踪号：{result.requestId}</p>}</section><div className="mt-7 flex flex-wrap justify-center gap-3"><a href={result.imageUrl} download={`make-it-me-${template.id}.png`} className="flex items-center gap-2 rounded-full bg-[#201e1c] px-5 py-3 text-sm text-white"><IconDownload size={17}/>保存写真</a><button onClick={again} className="rounded-full bg-white px-5 py-3 text-sm">重新生成</button><button onClick={reset} className="rounded-full bg-white px-5 py-3 text-sm">其他模板</button></div></div>;
}
