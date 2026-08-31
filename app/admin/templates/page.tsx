"use client";

import { useMemo, useState } from "react";
import { IconCheck, IconRefresh, IconSparkles, IconUpload } from "@tabler/icons-react";
import { portraitTemplates } from "@/services/portrait-templates";
import type { PortraitRetouchSettings } from "@/services/portrait-types";
import { allBaselineViews, baselineImagePath, baselineViewLabels, type BaselineGender, type BaselineView } from "@/services/portrait-reference-selection";

const defaultRetouchSettings: PortraitRetouchSettings = { skinSmoothing: 45, whitening: 30, blemishRemoval: 60, faceSlimming: 20, eyeEnlargement: 10, noseRefinement: 10, skinGlow: 45, makeupIntensity: 35 };

type Draft = {
  templateId: string;
  title?: string;
  status: "success" | "error";
  imageUrl?: string;
  blobUrl?: string;
  prompt?: string;
  elapsedMs?: number;
  error?: string;
  published?: boolean;
  baselineGender?: "female" | "male";
  baselineViews?: string[];
  retouchSettings?: PortraitRetouchSettings;
};

async function payload(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`服务返回异常（HTTP ${response.status}）`); }
}

export default function TemplateAdminPage() {
  const [secret, setSecret] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [baselineGender, setBaselineGender] = useState<"auto" | "female" | "male">("auto");
  const [referenceMode, setReferenceMode] = useState<"auto" | "manual">("auto");
  const [selectedBaselineViews, setSelectedBaselineViews] = useState<BaselineView[]>(["front"]);
  const [retouchSettings, setRetouchSettings] = useState<PortraitRetouchSettings>(defaultRetouchSettings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (templateId: string) => setSelected((current) => current.includes(templateId) ? current.filter((id) => id !== templateId) : [...current, templateId]);
  const requestDrafts = async (templateIds: string[]) => {
    if (!secret) throw new Error("请先输入管理员密钥");
    const response = await fetch("/api/admin/template-previews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ templateIds, baselineGender: baselineGender === "auto" ? undefined : baselineGender, baselineViews: referenceMode === "manual" ? selectedBaselineViews : undefined, retouchSettings, confirm: "GENERATE_TEMPLATE_PREVIEWS" }),
    });
    const result = await payload(response);
    if (!response.ok) throw new Error(result.error || "模板生成失败");
    setDrafts((current) => ({ ...current, ...Object.fromEntries((result.results as Draft[]).map((draft) => [draft.templateId, draft])) }));
  };
  const generate = async () => {
    if (!selected.length) return setMessage("请至少选择一个模板");
    setBusy(true); setMessage(`准备生成 ${selected.length} 个模板，请保持页面开启。`);
    try {
      for (let index = 0; index < selected.length; index += 5) {
        const batch = selected.slice(index, index + 5);
        setMessage(`正在生成第 ${index + 1}–${Math.min(index + 5, selected.length)} 个，共 ${selected.length} 个。`);
        await requestDrafts(batch);
      }
      setMessage("全部生成任务已完成，请逐张审核。生成失败的模板可以单独重试。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "模板生成失败"); }
    finally { setBusy(false); }
  };
  const regenerate = async (templateId: string) => {
    setBusy(true); setMessage("正在重新生成模板……");
    try { await requestDrafts([templateId]); setMessage("重新生成完成，请审核新草稿。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "重新生成失败"); }
    finally { setBusy(false); }
  };
  const publish = async (draft: Draft) => {
    if (!secret || !draft.blobUrl) return;
    setBusy(true); setMessage(`正在发布「${draft.title || draft.templateId}」……`);
    try {
      const response = await fetch("/api/admin/template-previews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ templateId: draft.templateId, blobUrl: draft.blobUrl, confirm: "PUBLISH_TEMPLATE_PREVIEW" }),
      });
      const result = await payload(response);
      if (!response.ok) throw new Error(result.error || "模板发布失败");
      setDrafts((current) => ({ ...current, [draft.templateId]: { ...current[draft.templateId], published: true } }));
      setMessage("发布成功，首页将在几分钟内使用新封面。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "模板发布失败"); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-[#efede9] px-5 py-10 text-[#211f1d]">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-5 rounded-[28px] bg-white p-6 sm:flex-row sm:items-end sm:justify-between">
        <div><span className="text-xs tracking-[.18em] text-[#806252]">TEMPLATE ADMIN</span><h1 className="mt-2 text-3xl font-semibold">Gemini 写真模板工作台</h1><p className="mt-2 text-sm text-[#746e69]">批量生成草稿、在线审核并发布。密钥只保存在当前页面内存，不会写入浏览器存储。</p></div>
        <label className="w-full max-w-md text-xs text-[#746e69]">管理员密钥<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-2xl border bg-[#faf9f7] px-4 py-3 text-sm outline-none focus:border-[#806252]"/></label>
      </header>
      <div className="sticky top-3 z-10 mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-[#201e1c]/95 p-4 text-white shadow-xl backdrop-blur">
        <button onClick={() => setSelected(selected.length === portraitTemplates.length ? [] : portraitTemplates.map((item) => item.id))} className="rounded-full bg-white/15 px-4 py-2 text-sm">{selected.length === portraitTemplates.length ? "取消全选" : "选择全部"}</button>
        <span className="text-sm">已选择 {selected.length} / {portraitTemplates.length}</span>
        <label className="flex items-center gap-2 text-sm">基准模特<select value={baselineGender} onChange={(event) => setBaselineGender(event.target.value as "auto" | "female" | "male")} className="rounded-full bg-white/15 px-3 py-2 outline-none"><option className="text-black" value="auto">按模板自动</option><option className="text-black" value="female">固定女模</option><option className="text-black" value="male">固定男模</option></select></label>
        <button disabled={busy || !selected.length || !secret} onClick={generate} className="ml-auto flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[#201e1c] disabled:opacity-40"><IconSparkles size={17}/>{busy ? "处理中" : "批量生成"}</button>
      </div>
      <BaselineMaterialSelector gender={baselineGender} mode={referenceMode} setMode={setReferenceMode} selected={selectedBaselineViews} setSelected={setSelectedBaselineViews}/>
      <AdminBeautyControls value={retouchSettings} onChange={setRetouchSettings}/>
      {message && <p className="mt-4 rounded-2xl bg-[#fff8dc] px-4 py-3 text-sm text-[#705d23]">{message}</p>}
      <section className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {portraitTemplates.map((template) => {
          const draft = drafts[template.id];
          return <article key={template.id} className={`overflow-hidden rounded-[24px] bg-white shadow-sm ${selectedSet.has(template.id) ? "ring-2 ring-[#806252]" : ""}`}>
            <button onClick={() => toggle(template.id)} className="relative block aspect-[3/4] w-full overflow-hidden text-left">
              <img src={draft?.imageUrl || template.coverImage} alt={template.title} className="h-full w-full object-cover"/>
              <span className={`absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full ${selectedSet.has(template.id) ? "bg-[#201e1c] text-white" : "bg-white/85"}`}>{selectedSet.has(template.id) && <IconCheck size={17}/>}</span>
              {draft?.published && <span className="absolute bottom-3 left-3 rounded-full bg-[#37754a] px-3 py-1.5 text-xs text-white">已发布</span>}
            </button>
            <div className="p-4"><h2 className="font-semibold">{template.title}</h2><p className="mt-1 text-xs text-[#827b75]">{template.id}{draft?.baselineGender ? ` · ${draft.baselineGender === "female" ? "女模" : "男模"}` : ""}{draft?.baselineViews?.length ? ` · ${draft.baselineViews.join("+")}` : ""}{draft?.retouchSettings ? " · 自定义美颜" : ""}{draft?.elapsedMs ? ` · ${(draft.elapsedMs / 1000).toFixed(1)} 秒` : ""}</p>
              {draft?.status === "error" && <p className="mt-3 rounded-xl bg-[#fff0ed] p-3 text-xs text-[#963b31]">{draft.error}</p>}
              {draft?.status === "success" && <div className="mt-4 flex gap-2"><button disabled={busy} onClick={() => regenerate(template.id)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#f1eeea] py-2.5 text-xs"><IconRefresh size={15}/>重新生成</button><button disabled={busy || draft.published} onClick={() => publish(draft)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#201e1c] py-2.5 text-xs text-white disabled:opacity-40"><IconUpload size={15}/>{draft.published ? "已发布" : "发布"}</button></div>}
            </div>
          </article>;
        })}
      </section>
    </div>
  </main>;
}

function BaselineMaterialSelector({ gender, mode, setMode, selected, setSelected }: { gender: "auto" | BaselineGender; mode: "auto" | "manual"; setMode: (value: "auto" | "manual") => void; selected: BaselineView[]; setSelected: (value: BaselineView[]) => void }) {
  const previewGenders: BaselineGender[] = gender === "auto" ? ["female", "male"] : [gender];
  const toggle = (view: BaselineView) => {
    if (view === "front") return;
    if (selected.includes(view)) return setSelected(selected.filter((item) => item !== view));
    if (selected.length >= 3) return;
    setSelected([...selected, view]);
  };
  return <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">模特素材选择器</h2><p className="mt-1 text-xs text-[#746e69]">正面身份照固定使用。自动模式按模板选择；手动模式最多选择三张。</p></div><div className="flex rounded-full bg-[#f1eeea] p-1 text-xs"><button onClick={() => setMode("auto")} className={`rounded-full px-4 py-2 ${mode === "auto" ? "bg-[#201e1c] text-white" : ""}`}>自动推荐</button><button onClick={() => setMode("manual")} className={`rounded-full px-4 py-2 ${mode === "manual" ? "bg-[#201e1c] text-white" : ""}`}>手动选择</button></div></div>{previewGenders.map((itemGender) => <div key={itemGender} className="mt-5"><p className="mb-3 text-xs font-semibold text-[#746e69]">{itemGender === "female" ? "女性基准模特" : "男性基准模特"}</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{allBaselineViews.map((view) => { const active = mode === "manual" && selected.includes(view); return <button key={view} disabled={mode === "auto" || (view !== "front" && !active && selected.length >= 3)} onClick={() => toggle(view)} className={`relative overflow-hidden rounded-xl border-2 text-left disabled:cursor-not-allowed ${active ? "border-[#806252]" : "border-transparent"}`}><img src={baselineImagePath(itemGender, view)} alt={`${itemGender}-${view}`} className="aspect-[3/4] w-full object-cover"/><span className="block bg-[#f7f5f2] px-2 py-2 text-[11px]">{baselineViewLabels[view]}{view === "front" ? " · 固定" : ""}</span>{active && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[#201e1c] text-white"><IconCheck size={14}/></span>}</button>; })}</div></div>)}</section>;
}

function AdminBeautyControls({ value, onChange }: { value: PortraitRetouchSettings; onChange: (value: PortraitRetouchSettings) => void }) {
  const controls: Array<[keyof PortraitRetouchSettings, string]> = [
    ["skinSmoothing", "磨皮"], ["whitening", "美白"], ["blemishRemoval", "祛瑕"], ["faceSlimming", "瘦脸"],
    ["eyeEnlargement", "大眼"], ["noseRefinement", "鼻型"], ["skinGlow", "皮肤光泽"], ["makeupIntensity", "妆容"],
  ];
  return <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">模板美颜参数</h2><p className="mt-1 text-xs text-[#746e69]">参数将应用于本次批量生成和单张重新生成；证件照仍由服务端强制限制为轻度精修。</p></div><button onClick={() => onChange(defaultRetouchSettings)} className="rounded-full bg-[#f1eeea] px-4 py-2 text-xs">恢复默认</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{controls.map(([key, label]) => <label key={key} className="block rounded-xl bg-[#f7f5f2] p-3"><span className="flex justify-between text-xs"><b>{label}</b><span>{value[key]}</span></span><input type="range" min="0" max="100" step="5" value={value[key]} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} className="mt-3 w-full accent-[#806252]"/></label>)}</div></section>;
}
