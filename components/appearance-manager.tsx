"use client";

import { useRef, useState } from "react";
import { IconCheck, IconPhotoPlus, IconTrash, IconX } from "@tabler/icons-react";

export type Appearance = {
  id: string;
  name: string;
  tag: string;
  image: string;
  parts?: Record<string, string>;
};

const partLabels = [
  ["identity", "本人正脸", "必需"],
  ["hair", "发型", "可选"],
  ["makeup", "妆容", "可选"],
  ["outfit", "穿搭", "可选"],
  ["accessories", "配饰", "可选"],
];

type Props = {
  open: boolean;
  appearances: Appearance[];
  selectedId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: (appearance: Appearance) => void;
  onDelete: (id: string) => void;
};

export function AppearanceManager({ open, appearances, selectedId, onClose, onSelect, onCreate, onDelete }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("新的我");
  const [parts, setParts] = useState<Record<string, string>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  if (!open) return null;

  const chooseFile = (part: string, file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setParts((current) => ({ ...current, [part]: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!parts.identity) return;
    onCreate({ id: `custom-${Date.now()}`, name: name.trim() || "新的我", tag: "我的", image: parts.identity, parts });
    setCreating(false);
    setName("新的我");
    setParts({});
  };

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[30px] border border-white/10 bg-[#151517] p-5 shadow-2xl sm:rounded-[30px] sm:p-7">
      <div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[.2em] text-lime-200/70">User Appearance</p><h2 className="mt-2 text-2xl font-medium tracking-tight">我的形象</h2><p className="mt-1 text-xs text-white/35">组合身份、发型、妆容、穿搭和配饰，保存成可复用资产。</p></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-white/10"><IconX size={17}/></button></div>

      {!creating ? <>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{appearances.map((item) => <div key={item.id} className={`group relative overflow-hidden rounded-2xl border ${selectedId === item.id ? "border-lime-300" : "border-white/10"}`}><button className="block w-full text-left" onClick={() => { onSelect(item.id); onClose(); }}><div className="relative aspect-[4/5]"><img src={item.image} alt={item.name} className="h-full w-full object-cover"/>{selectedId === item.id && <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-lime-300 text-black"><IconCheck size={15}/></span>}</div><div className="bg-white/[.025] p-3"><b className="text-xs">{item.name}</b><span className="ml-2 text-[9px] text-lime-200">{item.tag}</span></div></button>{item.id.startsWith("custom-") && <button aria-label={`删除${item.name}`} onClick={() => onDelete(item.id)} className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white/70 opacity-0 backdrop-blur group-hover:opacity-100"><IconTrash size={14}/></button>}</div>)}</div>
        <button onClick={() => setCreating(true)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 py-4 text-xs text-white/60 hover:border-lime-300/50 hover:text-white"><IconPhotoPlus size={17}/> 创建新形象</button>
      </> : <>
        <div className="mt-6"><label className="text-xs text-white/45">形象名称</label><input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm outline-none focus:border-lime-300/50" maxLength={20}/></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">{partLabels.map(([part, label, requirement]) => <div key={part}><input ref={(node) => { fileInputs.current[part] = node; }} type="file" accept="image/*" className="hidden" onChange={(event) => chooseFile(part, event.target.files?.[0])}/><button onClick={() => fileInputs.current[part]?.click()} className={`relative aspect-[4/5] w-full overflow-hidden rounded-2xl border ${parts[part] ? "border-lime-300/50" : "border-dashed border-white/15 bg-white/[.025]"}`}>{parts[part] ? <img src={parts[part]} alt={label} className="h-full w-full object-cover"/> : <span className="grid h-full place-items-center"><span><IconPhotoPlus size={20} className="mx-auto text-white/35"/><b className="mt-2 block text-[11px]">{label}</b><span className="mt-1 block text-[9px] text-white/25">{requirement}</span></span></span>}{parts[part] && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-lime-300 text-black"><IconCheck size={13}/></span>}</button></div>)}</div>
        <p className="mt-4 text-[10px] leading-4 text-white/30">建议上传清晰、无遮挡的正面照片。当前 Demo 将素材保存在本机浏览器中，不会发送到服务器。</p>
        <div className="mt-6 flex gap-2"><button onClick={() => setCreating(false)} className="flex-1 rounded-2xl border border-white/10 py-3.5 text-xs">取消</button><button disabled={!parts.identity} onClick={save} className="flex-[2] rounded-2xl bg-lime-300 py-3.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-30">保存到我的形象</button></div>
      </>}
    </div>
  </div>;
}

