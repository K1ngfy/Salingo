"use client";

import { useEffect, useRef, useState } from "react";
import { Database, DownloadSimple, Eye, EyeSlash, FileArrowUp, Key, Palette, Trash, Trophy } from "@phosphor-icons/react";
import { useAppData } from "@/components/data-provider";
import { useCommunity } from "@/components/community-provider";
import { ThemeModeControl } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { aiProxyMode, aiProxyUrl } from "@/lib/ai";

export default function SettingsPage() {
  const { data, hydrated, setAI, exportData, importData, reset } = useAppData();
  const [settings, setSettings] = useState(data.ai);
  const [showKey, setShowKey] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (hydrated) setSettings(data.ai); }, [data.ai, hydrated]);
  const save = async () => {
    if (!settings.model.trim()) { setNotice("模型名称不能为空"); return; }
    try { await setAI(settings); setNotice("AI 接口配置已保存到此浏览器"); }
    catch { setNotice("AI 接口配置保存失败，请检查填写内容后重试"); }
  };
  const importBackup = async (file?: File) => { if (!file) return; const result = await importData(await file.text()); setNotice(result.message); if (fileRef.current) fileRef.current.value = ""; };
  return <div className="mx-auto max-w-3xl"><p className="text-sm font-black text-[var(--c-777)]">SETTINGS</p><h1 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">设置与本地数据</h1><p className="mt-2 font-semibold text-[var(--c-777)]">所有设置和学习记录仅保存在当前浏览器，不会上传到 SALINGO 服务器。</p>
    {notice && <p className="mt-5 rounded-xl bg-[var(--c-edfadd)] p-3 text-sm font-bold text-[var(--c-4c8c17)]">{notice}</p>}
    <section className="mt-7 rounded-[1.7rem] border-2 border-[var(--c-e8e8e3)] bg-[var(--surface)] p-6"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[var(--c-f2e9ff)] text-[var(--c-874eb0)]"><Palette size={24} weight="duotone" /></span><div><h2 className="text-lg font-black">外观</h2><p className="text-sm font-semibold text-[var(--c-888)]">选择浅色、深色，或跟随系统设置</p></div></div><div className="mt-5"><ThemeModeControl /></div></section>
    <section className="mt-5 rounded-[1.7rem] border-2 border-[var(--c-e8e8e3)] bg-[var(--surface)] p-6"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[var(--c-e8f7ff)] text-[var(--c-1cb0f6)]"><Key size={24} weight="duotone" /></span><div><h2 className="text-lg font-black">AI 接口</h2><p className="text-sm font-semibold text-[var(--c-888)]">支持 OpenAI Chat Completions 兼容端点</p></div></div>{aiProxyUrl && <p className="mt-5 rounded-xl bg-[var(--c-e8f7ff)] p-3 text-xs font-semibold leading-5 text-[var(--c-1679a7)]">{aiProxyMode === "hosted" ? "Sites 同源 AI 代理已启用，不再由浏览器跨域直连。托管端已配置服务商时，接口地址和 Key 可以留空，只需填写模型。" : "统一 AI 代理已启用：更换兼容服务商时可修改下方地址、Key 和模型，无需修改代码。"}</p>}<div className="mt-6 grid gap-4"><label className="text-sm font-black">接口地址<input value={settings.baseUrl} onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })} placeholder="托管模式可留空；自定义时填写 https://api.openai.com/v1" className="mt-2 h-12 w-full rounded-xl border-2 border-[var(--c-deded8)] px-4 outline-none focus:border-[var(--c-1cb0f6)]" /></label><label className="text-sm font-black">API Key<span className="relative mt-2 block"><input type={showKey ? "text" : "password"} value={settings.apiKey} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} placeholder="托管模式可留空；自定义时填写 sk-…" className="h-12 w-full rounded-xl border-2 border-[var(--c-deded8)] px-4 pr-12 outline-none focus:border-[var(--c-1cb0f6)]" /><button type="button" onClick={() => setShowKey((value) => !value)} className="absolute right-2 top-1 grid size-10 place-items-center rounded-lg text-[var(--c-888)] hover:bg-[var(--c-eee)]" aria-label={showKey ? "隐藏密钥" : "显示密钥"}>{showKey ? <EyeSlash size={20} /> : <Eye size={20} />}</button></span></label><label className="text-sm font-black">模型名称<input value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} placeholder="gpt-5-mini" className="mt-2 h-12 w-full rounded-xl border-2 border-[var(--c-deded8)] px-4 outline-none focus:border-[var(--c-1cb0f6)]" /></label></div><p className="mt-4 rounded-xl bg-[var(--c-fff7e5)] p-3 text-xs font-semibold leading-5 text-[var(--c-89672c)]">安全提示：长期密钥不会写入前端构建。自定义 Key 仅保存在当前浏览器，并通过同源代理转发到所选服务商。</p><Button variant="blue" className="mt-5" onClick={save}>保存 AI 配置</Button></section>
    <CommunitySection />
    <section className="mt-5 rounded-[1.7rem] border-2 border-[var(--c-e8e8e3)] bg-[var(--surface)] p-6"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[var(--c-f3eee8)] text-[var(--c-9b6b43)]"><Database size={24} weight="duotone" /></span><div><h2 className="text-lg font-black">学习数据</h2><p className="text-sm font-semibold text-[var(--c-888)]">{data.questions.length} 道题 · {data.answers.length} 条答题记录 · {data.exams.length} 场模考</p></div></div><div className="mt-6 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => void exportData()}><DownloadSimple size={19} weight="bold" />导出完整备份</Button><input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => importBackup(e.target.files?.[0])} /><Button variant="secondary" onClick={() => fileRef.current?.click()}><FileArrowUp size={19} weight="bold" />恢复备份</Button></div><div className="mt-6 border-t-2 border-[var(--c-f0f0ec)] pt-6"><h3 className="font-black text-[var(--c-d83a3a)]">危险操作</h3>{confirmReset ? <div className="mt-3 rounded-xl bg-[var(--c-fff0f0)] p-4"><p className="text-sm font-bold text-[var(--c-a73b3b)]">确定清除所有学习进度、错题、模考和自定义题目吗？此操作无法撤销。</p><div className="mt-3 flex gap-2"><Button variant="danger" onClick={async () => { try { await reset(); setConfirmReset(false); setNotice("本地数据已重置"); } catch { setNotice("本地数据重置失败，请重试"); } }}>确认清除</Button><Button variant="secondary" onClick={() => setConfirmReset(false)}>取消</Button></div></div> : <Button variant="ghost" className="mt-2 text-[var(--c-d83a3a)]" onClick={() => setConfirmReset(true)}><Trash size={19} weight="bold" />重置全部本地数据</Button>}</div></section>
  </div>;
}

function CommunitySection() {
  const { profile, ready, restoreProfile, signOut, syncing, syncError } = useCommunity();
  const [showCode, setShowCode] = useState(false);
  const [restoreCode, setRestoreCode] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setNotice("恢复码已复制"); } catch { setNotice("复制失败，请手动选择"); } };
  const restore = async () => {
    if (!restoreCode.trim()) { setNotice("请输入恢复码"); return; }
    setBusy(true);
    try { const restored = await restoreProfile(restoreCode.trim()); setNotice(`已恢复账号：${restored.nickname}`); setRestoreCode(""); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "恢复失败，请检查恢复码"); }
    finally { setBusy(false); }
  };
  return (
    <section className="mt-5 rounded-[1.7rem] border-2 border-[var(--c-e8e8e3)] bg-[var(--surface)] p-6">
      <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[var(--c-fff3e0)] text-[var(--c-ff9600)]"><Trophy size={24} weight="duotone" /></span><div><h2 className="text-lg font-black">排行榜账号</h2><p className="text-sm font-semibold text-[var(--c-888)]">用恢复码在其他设备找回你的排名与进度</p></div></div>
      {notice && <p className="mt-4 rounded-xl bg-[var(--c-edfadd)] p-3 text-sm font-bold text-[var(--c-4c8c17)]">{notice}</p>}
      {syncError && <p className="mt-4 rounded-xl bg-[var(--c-fff7e5)] p-3 text-xs font-semibold text-[var(--c-89672c)]">排行榜同步暂不可用：{syncError}</p>}
      {!ready ? <p className="mt-5 font-semibold text-[var(--c-999)]">加载中…</p> : profile ? (
        <div className="mt-5 space-y-4">
          <div><p className="text-sm font-black">昵称</p><p className="mt-1 font-bold text-[var(--c-555)]">{profile.nickname}{syncing && <span className="ml-2 text-xs font-semibold text-[var(--c-aaa)]">同步中…</span>}</p></div>
          <div>
            <p className="text-sm font-black">恢复码</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded-xl bg-[var(--c-f7f9f1)] px-4 py-3 font-black tracking-wide text-[var(--c-58a700)]">{showCode ? profile.recoveryCode : "••••-••••-•••-••••"}</code>
              <button type="button" onClick={() => setShowCode((value) => !value)} className="grid size-11 place-items-center rounded-xl text-[var(--c-888)] hover:bg-[var(--c-eee)]" aria-label={showCode ? "隐藏恢复码" : "显示恢复码"}>{showCode ? <EyeSlash size={20} /> : <Eye size={20} />}</button>
            </div>
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => void copy(profile.recoveryCode)}>复制恢复码</Button>
          </div>
          <p className="rounded-xl bg-[var(--c-fff7e5)] p-3 text-xs font-semibold leading-5 text-[var(--c-89672c)]">恢复码相当于账号密码，请妥善保存、不要分享。它只保存在本浏览器，SALINGO 不会替你找回。</p>
          <div className="border-t-2 border-[var(--c-f0f0ec)] pt-4">
            {confirmSignOut ? (
              <div className="rounded-xl bg-[var(--c-fff0f0)] p-4"><p className="text-sm font-bold text-[var(--c-a73b3b)]">退出后本设备将不再关联该账号。请确认已保存恢复码，否则无法找回。</p><div className="mt-3 flex gap-2"><Button variant="danger" size="sm" onClick={async () => { await signOut(); setConfirmSignOut(false); setNotice("已退出排行榜账号"); }}>确认退出</Button><Button variant="secondary" size="sm" onClick={() => setConfirmSignOut(false)}>取消</Button></div></div>
            ) : <Button variant="ghost" className="text-[var(--c-d83a3a)]" onClick={() => setConfirmSignOut(true)}>退出排行榜账号</Button>}
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <p className="font-semibold text-[var(--c-777)]">还没有加入排行榜。可以到「排行榜」页面用昵称加入，或在下方用已有恢复码找回账号。</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input value={restoreCode} onChange={(event) => setRestoreCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void restore(); }} placeholder="输入恢复码，例如 apple-tiger-724-lake" className="h-12 flex-1 rounded-xl border-2 border-[var(--c-deded8)] px-4 outline-none focus:border-[var(--c-58cc02)]" />
            <Button variant="blue" onClick={() => void restore()} disabled={busy}>{busy ? "恢复中…" : "恢复账号"}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
