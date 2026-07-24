# ⚠ 并行运行 check 与 build 会产生 TS6053
SUMMARY: 当 tsdown 清理 dist 时，并行的 tsc 可能仍在扫描 dist/index.d.mts，导致文件瞬时消失并报 TS6053。
READ WHEN: when TypeScript reports TS6053 for dist/index.d.mts during concurrent validation

---

本项目的 `tsconfig.json` 使用默认 include，因而 `tsc --noEmit` 会扫描已有的 `dist/index.d.mts`；
`tsdown` 构建开始时会清理旧的 `dist`。若 `pnpm check` 与 `pnpm build` 并行执行，`tsc`
可能先发现声明文件，随后在读取时碰上构建清理，从而报告文件不存在。

发布验证必须按照工作流顺序串行运行：

1. `pnpm check`
2. `pnpm test`
3. `pnpm build`

单独重跑 `pnpm check` 通过即可确认这是验证竞态，而不是源码或声明输出缺失。
