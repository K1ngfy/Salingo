import { Suspense } from "react";
import { LearnPageClient } from "./page-client";

export const metadata = { title: "专项闯关" };

export default function LearnPage() {
  return <Suspense fallback={<div className="h-64 animate-pulse rounded-[2rem] bg-[#f0f0ec]" />}><LearnPageClient /></Suspense>;
}
