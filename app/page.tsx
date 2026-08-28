"use client";

import { useRef, useState } from "react";
import { IconArrowLeft, IconCheck, IconDownload, IconRefresh, IconSparkles, IconUpload } from "@tabler/icons-react";
import { portraitTemplates } from "@/services/portrait-templates";
import type { PortraitGenerationResult, PortraitTemplate } from "@/services/portrait-types";

type Step = "templates" | "selfie" | "generating" | "result";
type Selfie = { dataUrl: string; width: number; height: number; name: string };

async function prepareSelfie(file: File): Promise<Selfie> {
  if (!file.type.startsWith("image/")) throw new Error("请选择 JPEG、PNG 或 WebP 图片");
  if (file.size > 12 * 1024 * 1024) throw new Error("自拍图片不能超过 12MB");
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = () => reject(new Error("无法读取自拍图片")); value.src = source; });
    if (Math.min(image.naturalWidth, image.naturalHeight) < 640) throw new Error("自拍分辨率过低，短边至少需要 640px");
    const scale = Math.min(1, 1536 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/jpeg", .9), width: image.naturalWidth, height: image.naturalHeight, name: file.name };
  } finally { URL.revokeObjectURL(source); }
}

export default function Home() {
  const [step, setStep] = useState<Step>("templates");
  const [template, setTemplate] = useState<PortraitTemplate>();
  const [selfie, setSelfie] = useState<Selfie>();
  const [result, setResult] = useState<PortraitGenerationResult>();
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const reset = () => { setStep("templates"); setTemplate(undefined); setSelfie(undefined); setResult(undefined); setError(undefined); };
  const choose = (value: PortraitTemplate) => { setTemplate(value); setSelfie(undefined); setResult(undefined); setError(undefined); setStep("selfie"); };
  const pick = async (file?: File) => { if (!file) return; try { setError(undefined); setSelfie(await prepareSelfie(file)); } catch (reason) { setSelfie(undefined); setError(reason instanceof Error ? reason.message : "自拍检查失败"); } if (input.current) input.current.value = ""; };
  const generate = async () => {
    if (!template || !selfie) return; setError(undefined); setStep("generating");
    try {
      const response = await fetch("/api/portrait-generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: template.id, selfieImage: selfie.dataUrl }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "写真生成失败"); setResult(payload); setStep("result");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "写真生成失败"); setStep("selfie"); }
  };
  return <main className="min-h-screen bg-[#efede9] text-[#211f1d]">
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => pick(event.target.files?.[0])}/>
    <header className="mx-auto flex h-20 max-w-6xl items-center px-5"><button onClick={reset} className="flex items-center gap-2 text-lg font-semibold"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#201e1c] text-white"><IconSparkles size={17}/></span>Make it me</button><span className="ml-auto rounded-full bg-white/70 px-3 py-1.5 text-xs">AI 写真内测</span></header>
    {step === "templates" && <Gallery choose={choose}/>}
    {step === "selfie" && template && <SelfiePage template={template} selfie={selfie} error={error} back={() => setStep("templates")} pick={() => input.current?.click()} generate={generate}/>}
    {step === "generating" && template && <Loading template={template}/>}
    {step === "result" && template && result && <Result template={template} result={result} again={() => setStep("selfie")} reset={reset}/>}
  </main>;
}

function Gallery({ choose }: { choose: (template: PortraitTemplate) => void }) {
  return <div className="mx-auto max-w-6xl px-5 pb-20"><section className="py-10 text-center sm:py-16"><span className="text-xs tracking-[.2em] text-[#806252]">PORTRAIT STUDIO</span><h1 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-6xl">一张自拍，生成你的写真</h1><p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#716c67]">选择写真模板，上传清晰自拍。AI 会保留你的身份，并完成妆造、服装、光线和场景重塑。</p></section><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{portraitTemplates.map((item) => <button key={item.id} onClick={() => choose(item)} className="group overflow-hidden rounded-[28px] bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className="aspect-[3/4] overflow-hidden"><img src={item.coverImage} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"/></div><div className="p-5"><h2 className="text-lg font-semibold">{item.title}</h2><div className="mt-3 flex gap-2">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-[#f3f0ec] px-2.5 py-1 text-[11px]">{tag}</span>)}</div></div></button>)}</div><p className="mt-8 text-center text-xs text-[#8b8580]">模板均为 AI 原创合成人像，不使用网络抓取图片。</p></div>;
}

function SelfiePage({ template, selfie, error, back, pick, generate }: { template: PortraitTemplate; selfie?: Selfie; error?: string; back: () => void; pick: () => void; generate: () => void }) {
  return <div className="mx-auto max-w-5xl px-5 pb-20"><button onClick={back} className="mt-5 flex items-center gap-2 text-sm"><IconArrowLeft size={16}/>重新选择模板</button><div className="mt-7 grid gap-7 lg:grid-cols-2"><section><img src={template.coverImage} alt={template.title} className="aspect-[3/4] w-full rounded-[28px] object-cover"/><h2 className="mt-4 text-xl font-semibold">{template.title}</h2><p className="mt-2 text-sm leading-6 text-[#716c67]">{template.prompt}</p></section><section className="rounded-[28px] bg-white p-6 sm:p-8"><span className="text-xs tracking-[.15em] text-[#806252]">YOUR SELFIE</span><h1 className="mt-3 text-3xl font-semibold">上传一张清晰自拍</h1><div className="mt-5 space-y-3">{template.selfieRequirements.map((item) => <div key={item} className="flex items-center gap-3 text-sm"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#e9f4dd]"><IconCheck size={14}/></span>{item}</div>)}</div>{selfie ? <div className="mt-6"><img src={selfie.dataUrl} alt="用户自拍" className="aspect-[3/4] w-full rounded-2xl object-cover"/><p className="mt-2 text-xs text-[#746e69]">{selfie.name} · {selfie.width} × {selfie.height}</p><button onClick={pick} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f2efeb] py-3 text-sm"><IconRefresh size={16}/>更换自拍</button></div> : <button onClick={pick} className="mt-7 grid aspect-[4/3] w-full place-items-center rounded-2xl border border-dashed bg-[#f8f6f3]"><span className="text-center"><IconUpload className="mx-auto"/><b className="mt-3 block text-sm">选择自拍照片</b><small className="mt-1 block text-[#837c76]">短边至少 640px，最大 12MB</small></span></button>}{error && <div role="alert" className="mt-4 rounded-2xl bg-[#fff0ed] p-4 text-sm text-[#963b31]"><b>真实生成失败</b><p className="mt-1">{error}</p><p className="mt-2 text-xs">没有使用 Mock 图片。</p></div>}<button disabled={!selfie} onClick={generate} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#201e1c] py-4 text-white disabled:opacity-35"><IconSparkles size={18}/>生成我的写真</button><p className="mt-4 text-center text-[11px] text-[#8d8680]">当前版本不会把自拍保存到用户资产库。</p></section></div></div>;
}

function Loading({ template }: { template: PortraitTemplate }) { return <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-5 text-center"><div><img src={template.coverImage} alt={template.title} className="mx-auto aspect-[3/4] w-56 animate-pulse rounded-[28px] object-cover opacity-60"/><IconSparkles className="mx-auto mt-7 animate-pulse"/><h1 className="mt-4 text-2xl font-semibold">正在生成你的写真</h1><p className="mt-3 text-sm leading-6 text-[#746e69]">正在保持你的身份，并重建模板的妆造、服装、光线与场景。请不要关闭页面。</p></div></div>; }

function Result({ template, result, again, reset }: { template: PortraitTemplate; result: PortraitGenerationResult; again: () => void; reset: () => void }) {
  return <div className="mx-auto max-w-5xl px-5 pb-20"><div className="py-8 text-center"><span className="text-xs tracking-[.15em] text-[#806252]">PORTRAIT READY</span><h1 className="mt-3 text-4xl font-semibold">这是你的写真</h1><p className="mt-3 text-sm text-[#746e69]">{result.model} · {(result.elapsedMs / 1000).toFixed(1)} 秒</p></div><div className="grid gap-5 sm:grid-cols-2"><img src={template.coverImage} alt="写真模板" className="aspect-[3/4] w-full rounded-[28px] object-cover"/><img src={result.imageUrl} alt="生成写真" className="aspect-[3/4] w-full rounded-[28px] bg-white object-cover"/></div><p className="mt-3 flex justify-center gap-2 text-sm"><IconCheck size={16}/>Gemini 真实生成</p><div className="mt-7 flex flex-wrap justify-center gap-3"><a href={result.imageUrl} download={`make-it-me-${template.id}.png`} className="flex items-center gap-2 rounded-full bg-[#201e1c] px-5 py-3 text-sm text-white"><IconDownload size={17}/>保存写真</a><button onClick={again} className="rounded-full bg-white px-5 py-3 text-sm">重新生成</button><button onClick={reset} className="rounded-full bg-white px-5 py-3 text-sm">其他模板</button></div></div>;
}

