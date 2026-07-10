# GitHub API 代理检查清单
SUMMARY: 在任何依赖环境代理的部署前，必须确认 Node.js Fetch 能实际访问 GitHub API。
READ WHEN: before any deployment behind an HTTP or HTTPS proxy

---

系统工具能访问 GitHub 不代表 Node.js 全局 `fetch` 会自动读取 `HTTP_PROXY` 或
`HTTPS_PROXY`。部署前用实际 Node.js 进程请求 `https://api.github.com`。

Node.js 24 可设置 `NODE_USE_ENV_PROXY=1`。其他环境可以通过插件的 `fetcher`
选项传入已配置代理的 Fetch 实现。
