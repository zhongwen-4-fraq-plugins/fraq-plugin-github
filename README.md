# fraq-plugin-github

把 GitHub App、GitHub API 与 QQ 群连接起来。功能参考
[cscs181/QQ-GitHub-Bot](https://github.com/cscs181/QQ-GitHub-Bot)，并适配 Fraq。

## 功能

- 安装和检查 GitHub App
- OAuth 授权 GitHub 用户
- QQ 群绑定默认仓库
- 按 `event/action` 订阅 GitHub App 事件
- 搜索代码、仓库和用户
- 查看贡献图、仓库、Issue、Pull Request、Commit 和 Release
- 查看 README、License、文件、Deployment 和 PR Diff
- Star、评论、增删标签、关闭和重开 Issue/PR
- 批准 PR，使用 merge、squash 或 rebase 合并 PR
- 回复含 GitHub 链接的消息后执行快捷操作
- 自动校验 Webhook 签名并过滤重复投递

预览和贡献图使用轻量文本输出，不依赖浏览器，适合资源有限的机器人服务器。

## 工作方式

GitHub App 负责两件事：

1. App 安装到哪些仓库。
2. App 的 Webhook 接收哪些事件。

插件内的群订阅只负责决定“收到事件后转发到哪个 QQ 群”，不会为每个仓库创建传统 Webhook。

读取私有仓库时，插件使用 GitHub App installation token。Star、评论、审批等代表个人的操作使用该 QQ 用户授权的 OAuth token。

## 安装

```bash
pnpm add fraq-plugin-github @fraqjs/plugin-hono
```

## 创建 GitHub App

在 GitHub Developer settings 中创建 GitHub App：

- Callback URL：`https://你的域名/github/auth`
- Webhook URL：`https://你的域名/github/app/webhook`
- Webhook secret：生成一段随机字符串
- Repository permissions：
  - Contents：Read-only
  - Metadata：Read-only
  - Deployments：Read-only
  - Issues：Read and write
  - Pull requests：Read and write
- Account permissions：Starring：Read and write
- Subscribe to events：按需选择 Issues、Issue comment、Pull request、Pull request review、Push、Release、Star、Workflow run 等事件

然后记录以下信息：

- App ID
- App slug，即 App 网址中的名称
- Client ID
- Client secret
- Private key
- Webhook secret

最后把 App 安装到需要管理的仓库。

## 配置插件

```ts
import { Context } from '@fraqjs/fraq';
import HonoPlugin from '@fraqjs/plugin-hono';
import GitHubPlugin from 'fraq-plugin-github';

const ctx = Context.fromUrl('http://127.0.0.1:30001');

ctx.install(HonoPlugin, {
  host: '0.0.0.0',
  port: 4649,
});

ctx.install(GitHubPlugin, {
  app: {
    appId: process.env.GITHUB_APP_ID,
    appSlug: process.env.GITHUB_APP_SLUG,
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    privateKey: process.env.GITHUB_PRIVATE_KEY?.replaceAll('\\n', '\n'),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  adminUserIds: [123456789],
});

await ctx.start();
```

Private key 也可以按行传入：

```ts
privateKey: [
  '-----BEGIN PRIVATE KEY-----',
  '...',
  '-----END PRIVATE KEY-----',
]
```

确保公网域名已把 `/github/auth` 和 `/github/app/webhook` 转发到 Hono 的端口。

## 基础命令

以下示例都以默认的 `github` 命令组为前缀。

### App 安装与用户授权

```text
github install
github install check [owner/repo]
github install revoke [owner/repo]

github auth
github auth check
github auth revoke
```

`install revoke` 会从 GitHub 真正卸载 App，可能影响其他群，请谨慎使用。

### 群绑定与事件订阅

```text
github bind owner/repo
github unbind

github subscribe owner/repo
github subscribe owner/repo issues/opened issues/closed pull_request push
github unsubscribe owner/repo issues/closed
github unsubscribe owner/repo
github subscriptions
```

- `event` 订阅该事件的全部 action。
- `event/action` 只订阅指定 action。
- 不提供事件时订阅该仓库的全部 App 事件。
- `bind` 设置本群默认仓库，之后许多命令可省略 `owner/repo`。

## 查询与预览

```text
github search 关键词
github search repo 关键词
github search user 关键词
github search code 关键词

github contribution [用户名]
github repo [owner/repo]
github view owner/repo#123
github view https://github.com/owner/repo/pull/123
github link [owner/repo#123]
github readme [owner/repo]
github license [owner/repo]
github content owner/repo path/to/file
github release [owner/repo] [tag]
github deployments [owner/repo]
github diff owner/repo#123
```

直接发送以下内容也会显示预览：

```text
owner/repo
owner/repo#123
https://github.com/owner/repo/issues/123
https://github.com/owner/repo/commit/sha
https://github.com/owner/repo/releases/tag/v1.0.0
```

## GitHub 写操作

这些命令需要先执行 `github auth`：

```text
github star [owner/repo]
github unstar [owner/repo]

github comment owner/repo#123 评论内容
github label owner/repo#123 bug help-wanted
github unlabel owner/repo#123 bug
github close owner/repo#123 [原因]
github reopen owner/repo#123

github approve owner/repo#123 [审核意见]
github merge owner/repo#123 [提交标题]
github squash owner/repo#123 [提交标题]
github rebase owner/repo#123
```

也可以先回复一条包含 Issue 或 PR 链接的消息，再省略目标：

```text
github comment 已处理
github label bug
github close 已完成
github approve 检查通过
github squash
github diff
```

GitHub 上的操作记录属于 OAuth 授权对应的 GitHub 用户。

## 配置项

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `app.webhookSecret` | GitHub App Webhook secret | 必填 |
| `app.webhookPath` | Webhook HTTP 路径 | `/github/app/webhook` |
| `app.appId` | GitHub App ID，用于 installation token | 查询私有仓库时必填 |
| `app.appSlug` | GitHub App URL 名称，用于生成安装链接 | 使用 `install` 时必填 |
| `app.privateKey` | GitHub App 私钥 | 查询私有仓库时必填 |
| `app.clientId` | OAuth Client ID | 使用 `auth` 时必填 |
| `app.clientSecret` | OAuth Client secret | 使用 `auth` 时必填 |
| `subscriptionsFile` | 群订阅、绑定和用户授权数据文件 | `data/fraq-plugin-github.json` |
| `initialSubscriptions` | 启动时加入的初始订阅 | `{}` |
| `adminUserIds` | 插件管理员 QQ 号 | `[]` |
| `allowGroupAdmins` | 是否允许群主和群管理员修改订阅 | `true` |
| `apiBaseUrl` | GitHub API 地址 | `https://api.github.com` |
| `webBaseUrl` | GitHub 网页地址 | `https://github.com` |
| `maxReplyLength` | 文本回复最大长度 | `3500` |
| `fetcher` | 自定义 Fetch 实现，可用于代理或测试 | Node.js 全局 `fetch` |

订阅文件包含 OAuth token，请限制文件访问权限，不要提交到 Git 仓库。

## 安全建议

- 所有密钥都通过环境变量传入。
- 公网入口必须使用 HTTPS。
- GitHub App 只授予真正需要的权限。
- 只有可信用户才能加入 `adminUserIds`。
- 定期检查 App 安装范围和已授权用户。

如果服务器通过 `HTTP_PROXY` 或 `HTTPS_PROXY` 访问 GitHub，Node.js 24 可以设置
`NODE_USE_ENV_PROXY=1`。其他环境也可以通过 `fetcher` 传入已经配置代理的 Fetch。

## 开发

```bash
pnpm check
pnpm test
pnpm build
```
