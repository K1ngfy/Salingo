"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Brain, CalendarCheck, ChartLineUp, Fire, FlagCheckered, Lightning, Target, Timer } from "@phosphor-icons/react";
import { DomainIcon } from "@/components/domain-icon";
import { useAppData } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { DOMAINS } from "@/lib/domains";
import { dateKey, percent } from "@/lib/utils";

function calculateStreak(dates: string[]) {
  const set = new Set(dates);
  const date = new Date();
  let count = 0;
  if (!set.has(dateKey(date))) date.setDate(date.getDate() - 1);
  while (set.has(dateKey(date))) { count += 1; date.setDate(date.getDate() - 1); }
  return count;
}

export default function DashboardPage() {
  const { data, hydrated } = useAppData();
  const correct = data.answers.filter((item) => item.correct).length;
  const due = data.reviews.filter((item) => new Date(item.due) <= new Date()).length;
  const streak = calculateStreak(data.streakDates);
  const activeDays = new Set(data.answers.map((item) => dateKey(new Date(item.answeredAt)))).size;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#252f22] px-6 pb-7 pt-7 text-white shadow-[0_12px_0_#dfe4d9] sm:px-9 sm:pb-9 sm:pt-8">
        <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-[#58cc02]/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-[18%] h-36 w-36 rotate-12 rounded-[2rem] border-[18px] border-white/5" />
        <div className="relative grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#b8dca0]"><CalendarCheck size={19} weight="duotone" /> 今天适合再向前走一关</div>
            <h1 className="balance max-w-3xl text-3xl font-black leading-[1.12] tracking-[-0.04em] sm:text-5xl">把复杂的 CISSP，<br className="hidden sm:block" />练成你的判断本能。</h1>
            <p className="pretty mt-4 max-w-2xl text-sm font-semibold leading-7 text-[#cdd6c8] sm:text-base">按现行 ISC² 官方八域考纲组织 · 本地保存 · 无账号 · 题目为原创练习，适用于 2025–2026 备考。</p>
          </div>
          <Button asChild size="lg" className="w-full lg:w-auto"><Link href="/learn"><Lightning size={22} weight="fill" />开始今日闯关<ArrowRight size={18} weight="bold" /></Link></Button>
        </div>
      </section>

      <section aria-labelledby="today-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="text-sm font-extrabold text-[#58a700]">TODAY</p><h2 id="today-heading" className="mt-1 text-2xl font-black tracking-[-0.025em]">今天的学习路线</h2></div>
          <Link href="/stats" className="text-sm font-extrabold text-[#168fc7] hover:underline">查看详细统计</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { href: "/learn", icon: Target, eyebrow: "专项闯关", title: "继续八域训练", text: `${data.questions.length} 道练习题已就位`, color: "#58cc02", bg: "#effbe5" },
            { href: "/review", icon: Brain, eyebrow: "FSRS 复习", title: due ? `${due} 道今日到期` : "今日已无到期题", text: due ? "优先修复即将遗忘的知识" : "答错的题会自动排入复习", color: "#ff4b4b", bg: "#fff0f0" },
            { href: "/exam", icon: Timer, eyebrow: "全真模考", title: "检验综合判断", text: "按域组卷 · 统一交卷 · 分项报告", color: "#1cb0f6", bg: "#eaf8ff" },
          ].map((item, index) => (
            <motion.div key={item.href} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}>
              <Link href={item.href} className="group flex h-full min-h-40 items-center gap-5 rounded-[1.6rem] p-5 transition duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100" style={{ backgroundColor: item.bg }}>
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white shadow-sm" style={{ color: item.color }}><item.icon size={31} weight="duotone" /></span>
                <span className="min-w-0"><span className="text-xs font-black tracking-[0.12em]" style={{ color: item.color }}>{item.eyebrow}</span><span className="mt-1 block text-lg font-black">{item.title}</span><span className="mt-1 block text-sm font-semibold leading-5 text-[#777770]">{item.text}</span></span>
                <ArrowRight className="ml-auto shrink-0 transition group-hover:translate-x-1" size={20} weight="bold" style={{ color: item.color }} />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="grid gap-7 xl:grid-cols-[1fr_20rem]">
        <div>
          <div className="mb-4 flex items-end justify-between"><div><p className="text-sm font-extrabold text-[#1cb0f6]">8 DOMAINS</p><h2 className="mt-1 text-2xl font-black tracking-[-0.025em]">官方知识域</h2></div><span className="hidden text-xs font-bold text-[#999] sm:block">权重依据现行官方 Exam Outline</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {DOMAINS.map((domain, index) => {
              const answers = data.answers.filter((answer) => answer.domainId === domain.id);
              const domainCorrect = answers.filter((answer) => answer.correct).length;
              const domainDue = data.reviews.filter((review) => review.questionId.startsWith(domain.id) && new Date(review.due) <= new Date()).length;
              const progress = Math.min(100, answers.length * 5);
              return (
                <motion.article key={domain.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 + index * 0.035 }}>
                  <Link href={`/learn?domain=${domain.id}`} className="group flex min-h-36 gap-4 rounded-[1.5rem] border-2 border-[#ecece8] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#dcdcd6] hover:shadow-[0_6px_0_#ecece7] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100">
                    <span className="grid size-12 shrink-0 place-items-center rounded-[1rem]" style={{ backgroundColor: domain.softColor, color: domain.color }}><DomainIcon name={domain.icon} /></span>
                    <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-3"><span><span className="block text-[11px] font-black text-[#aaa]">DOMAIN {domain.number}</span><span className="mt-0.5 block font-black leading-5">{domain.name}</span></span><span className="rounded-lg px-2 py-1 text-xs font-black tabular-nums" style={{ backgroundColor: domain.softColor, color: domain.color }}>{domain.weight}%</span></span>
                      <span className="mt-3 block h-2 overflow-hidden rounded-full bg-[#ededE9]"><span className="block h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: domain.color }} /></span>
                      <span className="mt-2 flex gap-3 text-[11px] font-bold text-[#92928c]"><span>{answers.length} 题</span><span>{percent(domainCorrect, answers.length)}% 正确</span>{domainDue > 0 && <span className="text-[#ff4b4b]">{domainDue} 待复习</span>}</span>
                    </span>
                  </Link>
                </motion.article>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[1.6rem] bg-[#fff6df] p-5">
            <div className="flex items-center gap-2 text-[#c57700]"><Fire size={24} weight="fill" /><h2 className="font-black">学习火焰</h2></div>
            <div className="mt-5 flex items-end gap-2"><span className="text-5xl font-black leading-none tabular-nums text-[#3c3c3c]">{hydrated ? streak : "–"}</span><span className="pb-1 text-sm font-extrabold text-[#8c7a57]">连续天</span></div>
              <div className="mt-5 grid grid-cols-7 gap-1" aria-label="最近七天学习情况">{Array.from({ length: 7 }).map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); const key = dateKey(d); const active = data.streakDates.includes(key); return <span key={i} className={`h-8 rounded-lg ${active ? "bg-[#ffb020]" : "bg-white/80"}`} title={key} />; })}</div>
          </div>
          <div className="rounded-[1.6rem] border-2 border-[#ecece8] bg-white p-5">
            <h2 className="font-black">学习概览</h2>
            <dl className="mt-4 space-y-4">
              {[{ icon: FlagCheckered, label: "累计答题", value: data.answers.length }, { icon: ChartLineUp, label: "整体正确率", value: `${percent(correct, data.answers.length)}%` }, { icon: CalendarCheck, label: "活跃天数", value: activeDays }].map(({ icon: Icon, label, value }) => <div key={label} className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#f4f4f0] text-[#777]"><Icon size={20} weight="duotone" /></span><dt className="text-sm font-bold text-[#777]">{label}</dt><dd className="ml-auto font-black tabular-nums">{value}</dd></div>)}
            </dl>
          </div>
        </aside>
      </section>
    </div>
  );
}
