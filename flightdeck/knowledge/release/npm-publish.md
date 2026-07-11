# npm 发布检查清单
SUMMARY: 每次 npm 发布都必须使用与 package.json 版本一致的 v* Tag，并在检查、测试和构建通过后发布。
READ WHEN: before any npm release or change to the npm publishing workflow

---

发布由 `.github/workflows/publish.yml` 执行。仓库需要配置具有包发布权限的
`NPM_TOKEN` Actions Secret。

发布顺序：

1. 更新 `package.json` 版本并提交。
2. 创建 `v<version>` Tag，例如版本 `0.2.0` 对应 `v0.2.0`。
3. 推送 Tag。
4. 工作流校验版本，执行 `pnpm check`、`pnpm test`、`pnpm build`。
5. 使用 `npm publish --access public --provenance` 发布。

不要复用或移动已经发布的 Tag。版本不一致时应修改版本或创建正确的新 Tag，不要
绕过工作流中的校验。
