# GitHub App 事件路由
SUMMARY: 始终由 GitHub App 配置事件和安装仓库，QQ群订阅只维护仓库到群的本地转发关系。
READ WHEN: before any change to GitHub event subscription or webhook routing

---

GitHub App 只有一个集中配置的 Webhook。要接收哪些事件由 App 的
“Subscribe to events”决定，要接收哪些仓库由 App 的安装范围决定。

插件内的 `github subscribe owner/repo` 不调用 GitHub API，也不创建传统
repository webhook；它只记录收到该仓库事件后应转发到哪个 QQ 群。

因此排查“群里收不到事件”时，应依次确认：App 已选择该事件、App 已安装到
该仓库、Webhook 投递成功、目标群已执行本地订阅。
