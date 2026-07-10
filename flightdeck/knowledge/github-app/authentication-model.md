# GitHub App 认证模型
SUMMARY: 始终用 installation token 访问仓库，用 OAuth user token 执行代表 QQ 用户的个人操作。
READ WHEN: before any change to GitHub authentication or API permission handling

---

GitHub App JWT 只用于查询 App installation 和创建短期 installation token。
仓库内容、Issue、PR、Release、Deployment 等仓库级读取优先使用 installation
token；没有完整 App 配置时，公开仓库读取可以回退到未认证请求。

Star、评论、标签、关闭/重开、审批和合并等代表个人身份的操作使用 QQ 用户通过
`github auth` 获得的 OAuth user token。不要用 installation token 代替，否则 GitHub
上的操作归属和权限边界会改变。

OAuth 回调为 `/github/auth`，state 只在内存保存 10 分钟。用户 token 持久化在
`subscriptionsFile`，因此该文件必须限制访问且不得提交到 Git。
