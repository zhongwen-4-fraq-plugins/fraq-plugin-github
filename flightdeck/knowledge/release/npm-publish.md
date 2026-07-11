# npm 与 GitHub Release 发布检查清单
SUMMARY: 每次发布都必须使用与 package.json 版本一致的 v* Tag，通过验证后发布 npm，并从上次成功工作流以来的 commit 生成 GitHub Release。
READ WHEN: before any npm or GitHub Release, or change to the publishing workflow

---

发布由 `.github/workflows/publish.yml` 执行，使用 npm Trusted Publisher 和 GitHub
Actions OIDC，不保存 `NPM_TOKEN`。npm 包设置必须绑定以下 Publisher：

- Organization or user：`zhongwen-4-fraq-plugins`
- Repository：`fraq-plugin-github`
- Workflow filename：`publish.yml`
- Environment：空

Trusted Publisher 要求 npm CLI 11.5.1+、Node.js 22.14.0+ 和工作流权限
`id-token: write`。工作流固定使用 Node.js 24 与 npm 11.10.1。

发布顺序：

1. 更新 `package.json` 版本并提交。
2. 创建 `v<version>` Tag，例如版本 `0.2.0` 对应 `v0.2.0`。
3. 推送 Tag。
4. 工作流校验版本，执行 `pnpm check`、`pnpm test`、`pnpm build`。
5. 使用 `npm publish --access public --provenance` 发布。
6. 创建或更新同名 GitHub Release，正文只写 commit 更新日志。

更新日志基线是同一 `publish.yml` 工作流最近一次成功运行的 `head_sha`，不是简单的
上一个 Tag。脚本会检查最近一次已完成运行；若其失败或取消，则发出警告，并继续从
更早的成功运行收集 commit，避免失败发布期间的更新被遗漏。第一次成功发布没有基线，
会包含当前 Tag 可达的完整历史。

发布步骤可安全重跑：若 npm 中已经存在当前名称和版本，则跳过 `npm publish`；GitHub
Release 已存在时更新正文，不存在时创建。这样 npm 成功但 Release 失败后可以直接重跑。

不要复用或移动已经发布的 Tag。版本不一致时应修改版本或创建正确的新 Tag，不要
绕过工作流中的校验。
