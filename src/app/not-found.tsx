import Link from "next/link";
import { ArrowLeft, Compass } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <div className="mx-auto grid min-h-[65dvh] max-w-xl place-items-center text-center"><div><span className="mx-auto grid size-20 place-items-center rounded-[1.6rem] bg-[var(--c-e8f7ff)] text-[var(--c-1cb0f6)]"><Compass size={42} weight="duotone" /></span><p className="mt-6 text-sm font-black tracking-[0.18em] text-[var(--c-1cb0f6)]">404 · LOST LESSON</p><h1 className="mt-2 text-3xl font-black tracking-[-0.035em]">这一关不在学习地图上</h1><p className="mt-3 font-semibold text-[var(--c-777)]">页面可能已移动，回到总览继续学习。</p><Button asChild className="mt-6"><Link href="/"><ArrowLeft size={19} weight="bold" />返回总览</Link></Button></div></div>;
}
