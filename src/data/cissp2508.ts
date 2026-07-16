import rawRows1 from "./cissp2508-raw-1.json";
import rawRows2 from "./cissp2508-raw-2.json";
import rawRows3 from "./cissp2508-raw-3.json";
import type { DomainId, Question } from "@/lib/types";

const rawRows = [...rawRows1, ...rawRows2, ...rawRows3];

const DOMAIN_LABELS: Record<DomainId, string> = {
  d1: "安全与风险管理",
  d2: "资产安全",
  d3: "安全架构与工程",
  d4: "通信与网络安全",
  d5: "身份与访问管理",
  d6: "安全评估与测试",
  d7: "安全运营",
  d8: "软件开发安全",
};

const DOMAIN_RULES: Array<{ id: DomainId; patterns: RegExp[] }> = [
  { id: "d1", patterns: [/风险|治理|政策|标准|法律|法规|合规|GDPR|隐私|道德|尽职|职责分离|安全意识|培训|业务连续|BCP|灾难恢复计划|供应商|合同|管理层|组织结构|知识产权|威胁建模/i] },
  { id: "d2", patterns: [/数据分类|信息分类|资产分类|数据所有者|数据保管|数据生命周期|保留期|残留数据|数据擦除|介质|销毁|标记|标签|敏感数据|数据脱敏|数据泄露|数据存储|数据共享/i] },
  { id: "d3", patterns: [/密码学|加密|解密|密钥|数字签名|哈希|对称|非对称|PKI|证书|安全模型|Bell.?LaPadula|Biba|Clark.?Wilson|可信计算|TPM|硬件|物理安全|门禁|机房|云架构|虚拟化|容器|零信任|侧信道|TEMPEST/i] },
  { id: "d4", patterns: [/防火墙|网络|TCP|UDP|IPSec|VPN|VLAN|路由|交换机|无线|Wi-?Fi|蓝牙|DNS|DHCP|端口|协议|OSI|代理|NAT|WAF|DMZ|DoS|拒绝服务|电子邮件欺骗|ARP|RADIUS|EAP|PEAP|TLS|SSL/i] },
  { id: "d5", patterns: [/身份|认证|授权|访问权|访问控制|RBAC|ABAC|MAC|DAC|账户|账号|口令|密码策略|MFA|单点登录|SSO|SAML|OAuth|OIDC|OpenID|Kerberos|LDAP|生物识别|特权/i] },
  { id: "d6", patterns: [/审计|评估|测试|渗透|漏洞扫描|脆弱性|合规性检查|质量分析|SOC[123]|取样|日志审查|代码审查|白盒|黑盒|灰盒|基线检查|指标|度量|验证控制/i] },
  { id: "d7", patterns: [/事件响应|安全事件|事故|入侵|取证|证据|日志|监控|恶意软件|病毒|勒索|补丁|变更管理|备份|恢复|应急|灾难|操作安全|配置管理|职责轮换|离职|EOSL|端点|杀毒|HIDS|SIEM/i] },
  { id: "d8", patterns: [/软件|开发|程序|代码|编程|SDLC|敏捷|DevSecOps|数据库|输入验证|回归测试|单元测试|集成测试|源代码|API|Web 程序|应用程序|项目经理|开发语言|版本控制|OWASP|SQL 注入/i] },
];

const DOMAIN_TIE_PRIORITY: Record<DomainId, number> = { d1: 1, d2: 4, d3: 5, d4: 7, d5: 8, d6: 6, d7: 3, d8: 9 };

function cleanText(value: string) {
  return value.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

function splitEmbeddedExplanation(value: string) {
  const [option, ...explanation] = cleanText(value).split(/\s*解析[:：]\s*/);
  return { option, explanation: explanation.join(" ").trim() };
}

export function inferCisspDomain(text: string): DomainId {
  const scores = DOMAIN_RULES.map((rule) => ({
    id: rule.id,
    score: rule.patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0),
  }));
  const best = scores.sort((a, b) => b.score - a.score || DOMAIN_TIE_PRIORITY[b.id] - DOMAIN_TIE_PRIORITY[a.id])[0];
  return best?.score ? best.id : "d1";
}

export const CISSP2508_QUESTIONS: Question[] = rawRows.map((row) => {
  const sourceStem = cleanText(row.stem);
  const stem = sourceStem.length < 10 ? `${sourceStem}请选择最佳答案。` : sourceStem;
  const optionParts = row.options.map(splitEmbeddedExplanation).filter((part) => part.option);
  const optionTexts = optionParts.map((part) => part.option);
  const sourceExplanation = optionParts.map((part) => part.explanation).filter(Boolean).join(" ");
  const correctAnswers: string[] = row.answer.match(/[A-E]/g) ?? [];
  const type = correctAnswers.length > 1 ? "multiple" as const : "single" as const;
  const domainId = inferCisspDomain(`${stem} ${optionTexts.join(" ")}`);
  const options = optionTexts.map((text, index) => ({ id: String.fromCharCode(65 + index), text }));
  const answerLabel = correctAnswers.join("、");
  const answerSummary = correctAnswers.map((id) => `${id}. ${options.find((option) => option.id === id)?.text ?? ""}`).join("；");
  return {
    id: `cissp2508-${row.number.padStart(3, "0")}`,
    domainId,
    type,
    difficulty: type === "multiple" ? "高难" : "进阶",
    tags: ["CISSP2508模拟题", "用户导入", DOMAIN_LABELS[domainId]],
    stem,
    options,
    correctAnswers,
    explanation: {
      logic: sourceExplanation
        ? `原始题库给出的正确答案为 ${answerLabel}（${answerSummary}）。源文件附带说明：${sourceExplanation}`
        : `原始题库给出的正确答案为 ${answerLabel}（${answerSummary}）。请先识别题干中的“最佳、首先、最有效”等限定词，再按 ${DOMAIN_LABELS[domainId]} 的管理与技术原则比较选项。`,
      optionAnalysis: Object.fromEntries(options.map((option) => [option.id, correctAnswers.includes(option.id)
        ? `原始题库将 ${option.id} 标记为正确答案；可使用 AI 深度解析进一步核对其适用条件。`
        : `原始题库未将 ${option.id} 标记为正确答案；可使用 AI 深度解析进一步分析该选项的干扰点。`])),
      knowledgePoint: `Domain ${domainId.slice(1)} · ${DOMAIN_LABELS[domainId]}（根据题干关键词自动归类）`,
      plainLanguage: sourceExplanation
        ? "此题来自用户提供的模拟题库，系统保留了源文件随题附带的说明；可使用 AI 深度解析获得统一四段式解析。"
        : "此题来自用户提供的答案型模拟题库，原文件未附解析；系统保留原答案并明确标注自动归类结果。",
    },
    source: "imported",
    outlineVersion: "2024-current",
    createdAt: "2026-07-16T00:00:00.000Z",
  };
});
