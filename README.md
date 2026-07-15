# SALINGO 赛邻国

SALINGO 是一个本地优先、中文界面、受多邻国闯关体验启发的 CISSP 备考网页。项目没有账户、后端、云数据库、数据上报或付费功能；题库、答题记录、错题、FSRS 卡片、模考和 AI 设置均保存在当前浏览器的 `LocalStorage`。

> 题库声明：内置题目为依据公开考纲编写的原创学习题与原创情境变式，不是真题，也不复制或分发 Boson、Sybex/OSG 等商业题库。CISSP 考试题目受保密协议保护，请不要导入来源不明或无权使用的题目。

## 一键启动

要求：Node.js 20 或更高版本（推荐 Node.js 22），npm 10 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。首次启动不需要配置数据库或账号。

生产构建与纯静态导出：

```bash
npm run build
```

静态文件会生成到 `out/`，可由任意静态文件服务器托管。项目未使用 Route Handler、Server Action 或其他必须依赖服务端的功能。

## AI 接口配置

复制示例配置：

```bash
cp .env.example .env.local
```

```dotenv
NEXT_PUBLIC_AI_BASE_URL=https://api.openai.com/v1
NEXT_PUBLIC_AI_API_KEY=你的独立限额Key
NEXT_PUBLIC_AI_MODEL=gpt-5-mini
```

也可以在网页“设置”中填写。接口需要兼容 `POST /chat/completions`。AI 输出会先通过 Zod 结构校验，校验成功后才会写入题库；请求失败会显示行内错误，不会阻塞页面。

安全说明：纯前端直连意味着 API Key 对本机浏览器可见。此设计只适用于目标约束中的个人本地使用。建议创建独立、限额、可撤销的 Key；不要在共享设备或公开站点中放置长期密钥。

## 功能

- 八大知识域首页：官方权重、答题量、正确率、进度和待复习数。
- 专项闯关：单选、多选、进度条、答对/答错反馈、四段式解析。
- AI 深度解析：在内置四段式解析基础上，可用自定义模型重新分析当前选择；失败时保留内置内容。
- AI 原创出题：按域、难度和标签生成，自动校验、去重并本地入库。
- FSRS v6 复习：错误题自动排入复习，答对延长间隔，答错进入再学习。
- 全真模考：多域组卷、50/100/150/200 题配置、倒计时、暂停、答题卡、统一交卷、八域雷达图和错题归集。
- 统计面板：14 天正确率趋势、薄弱域排序和模考历史。
- 本地题库：搜索、筛选、JSON 导入导出、来源标记。
- 数据管理：完整备份、恢复和带二次确认的本地重置。
- 响应式与无障碍：桌面/移动导航、键盘焦点、跳转主内容、减少动画偏好和品牌 404。

## 题库

`public/data/questions.json` 包含 800 道原创练习，八域各 100 道。题库由 80 个独立知识蓝本（每域 10 个）与 10 个行业情境和选项排列组合生成：

```bash
npm run generate:bank
npm run check:bank
```

校验会检查：结构、唯一 ID、总题量、八域覆盖、答案有效性和考纲版本标记。运行时也会把新版内置题目与已有 LocalStorage 合并，不覆盖用户自己的题目或学习记录。

题目 JSON 核心结构：

```json
{
  "id": "d1-care-003-v02",
  "domainId": "d1",
  "type": "single",
  "difficulty": "进阶",
  "tags": ["应有注意", "应尽职责"],
  "stem": "题干",
  "options": [{ "id": "A", "text": "选项" }],
  "correctAnswers": ["B"],
  "explanation": {
    "logic": "核心作答逻辑",
    "optionAnalysis": { "A": "逐项排错" },
    "knowledgePoint": "考点定位",
    "plainLanguage": "通俗解读"
  },
  "source": "original",
  "outlineVersion": "2024-current",
  "createdAt": "2026-07-15T00:00:00.000Z"
}
```

## 数据持久化

主存储键为 `salingo:data:v1`，包含：

- `questions`：内置、AI 和导入题目；
- `answers`：专项、复习和模考答题记录；
- `reviews`：FSRS 卡片状态、到期时间、错误类型和收藏状态；
- `exams`：模考配置、作答、分域成绩；
- `streakDates`：实际发生答题的日期；
- `ai`：本机 AI 接口设置。

升级内置题库时按题目 ID 合并，不会覆盖同一浏览器中已有的学习记录。建议定期在“设置”中导出完整备份。

## 考纲依据

截至 2026-07-15，ISC² 公开的现行 CISSP Exam Outline 仍为 2024-04-15 生效版本，适用于当前 2025–2026 备考。项目没有虚构“2026 新权重”。

| 知识域 | 权重 |
| --- | ---: |
| 1. Security and Risk Management | 16% |
| 2. Asset Security | 10% |
| 3. Security Architecture and Engineering | 13% |
| 4. Communication and Network Security | 13% |
| 5. Identity and Access Management | 13% |
| 6. Security Assessment and Testing | 12% |
| 7. Security Operations | 13% |
| 8. Software Development Security | 10% |

官方来源：

- [ISC² CISSP Certification Exam Outline](https://www.isc2.org/certifications/cissp/cissp-certification-exam-outline)
- [Next.js 15 静态部署文档](https://nextjs.org/docs/15/app/getting-started/deploying)
- [ts-fsrs 官方仓库](https://github.com/open-spaced-repetition/ts-fsrs)
- [Tailwind CSS Next.js 安装文档](https://tailwindcss.com/docs/installation/framework-guides/nextjs)

## 验收命令

```bash
npm run check
```

该命令依次执行 ESLint、严格 TypeScript 检查、800 题题库校验和生产静态构建。人工浏览器验收记录见 [SELF_CHECK.md](./SELF_CHECK.md)。
