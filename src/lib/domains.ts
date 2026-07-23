import type { Domain } from "./types";

export const DOMAINS: Domain[] = [
  { id: "d1", number: 1, name: "安全与风险管理", shortName: "风险管理", english: "Security and Risk Management", weight: 16, color: "var(--c-58a700)", softColor: "var(--c-e8f7d8)", icon: "compass" },
  { id: "d2", number: 2, name: "资产安全", shortName: "资产安全", english: "Asset Security", weight: 10, color: "var(--c-ce82ff)", softColor: "var(--c-f4e7ff)", icon: "archive" },
  { id: "d3", number: 3, name: "安全架构与工程", shortName: "架构工程", english: "Security Architecture and Engineering", weight: 13, color: "var(--c-1cb0f6)", softColor: "var(--c-dff4ff)", icon: "blueprint" },
  { id: "d4", number: 4, name: "通信与网络安全", shortName: "网络安全", english: "Communication and Network Security", weight: 13, color: "var(--c-ff9600)", softColor: "var(--c-fff0d4)", icon: "network" },
  { id: "d5", number: 5, name: "身份与访问管理", shortName: "身份访问", english: "Identity and Access Management", weight: 13, color: "var(--c-ff4b4b)", softColor: "var(--c-ffe2e2)", icon: "fingerprint" },
  { id: "d6", number: 6, name: "安全评估与测试", shortName: "评估测试", english: "Security Assessment and Testing", weight: 12, color: "var(--c-2b70c9)", softColor: "var(--c-e0edff)", icon: "check" },
  { id: "d7", number: 7, name: "安全运营", shortName: "安全运营", english: "Security Operations", weight: 13, color: "var(--c-14b8a6)", softColor: "var(--c-daf7f2)", icon: "pulse" },
  { id: "d8", number: 8, name: "软件开发安全", shortName: "开发安全", english: "Software Development Security", weight: 10, color: "var(--c-9b6b43)", softColor: "var(--c-f5eadf)", icon: "code" },
];

export const getDomain = (id: string) => DOMAINS.find((domain) => domain.id === id) ?? DOMAINS[0];
