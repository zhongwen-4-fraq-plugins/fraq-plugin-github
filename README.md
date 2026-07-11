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
  host: '127.0.0.1',
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

## QQ 侧权限

QQ 侧操作员由两部分组成：

- `adminUserIds` 配置列表中的 QQ 用户；
- 当前群的群主或群管理员。

只读查询对普通用户开放。修改群绑定、事件订阅和卸载 App 只允许上述操作员执行。
Star、评论、审批等 GitHub 写操作不检查 QQ 管理身份，只检查当前用户自己的 OAuth
授权和 GitHub 权限。

## 命令表

所有命令默认使用 `github` 前缀。`[参数]` 表示可以省略，`<参数>` 表示必须提供。

| 分类 | 命令 | 权限或前置条件 | 说明 |
| --- | --- | --- | --- |
| 帮助 | `github help` | 无 | 查看简要命令帮助。 |
| App | `github install` | 私聊；配置 `appSlug` | 获取 GitHub App 安装链接；群聊中不会返回安装链接。别名：`github 安装`。 |
| App | `github install check [owner/repo]` | App JWT | 检查仓库是否安装 App；省略仓库时使用群绑定仓库。 |
| App | `github install revoke [owner/repo]` | 配置列表或群管理 | 从 GitHub 真正卸载 App，可能影响其他群，请谨慎使用。 |
| 授权 | `github auth` | 配置 OAuth Client | 获取当前 QQ 用户的 GitHub OAuth 授权链接；别名：`github 授权`。 |
| 授权 | `github auth check` | 无 | 查看当前 QQ 用户绑定的 GitHub 账号。 |
| 授权 | `github auth revoke` | 已授权 | 撤销当前 QQ 用户的 GitHub OAuth 授权。 |
| 群设置 | `github bind <owner/repo>` | 配置列表或群管理 | 设置本群默认仓库；别名：`github 绑定`。 |
| 群设置 | `github unbind` | 配置列表或群管理 | 解除本群默认仓库；别名：`github 解绑`。 |
| 订阅 | `github subscribe <owner/repo>` | 配置列表或群管理 | 订阅仓库的全部 GitHub App 事件。 |
| 订阅 | `github subscribe <owner/repo> <event[/action] ...>` | 配置列表或群管理 | 订阅一个或多个事件或指定 action；别名：`github 订阅`。 |
| 订阅 | `github unsubscribe <owner/repo>` | 配置列表或群管理 | 取消仓库的全部群事件订阅。 |
| 订阅 | `github unsubscribe <owner/repo> <event[/action] ...>` | 配置列表或群管理 | 只取消指定事件或 action；别名：`github 取消订阅`。 |
| 订阅 | `github subscriptions` | 群聊 | 查看本群全部事件订阅。 |
| 搜索 | `github search <关键词>` | GitHub API | 搜索仓库；别名：`github 搜索`。 |
| 搜索 | `github search repo <关键词>` | GitHub API | 搜索仓库。 |
| 搜索 | `github search user <关键词>` | GitHub API | 搜索 GitHub 用户。 |
| 搜索 | `github search code <关键词>` | 建议先 OAuth 授权 | 搜索 GitHub 代码。 |
| 查询 | `github contribution [用户名]` | OAuth 授权 | 查看用户最近一年的贡献图；省略用户名时使用已授权账号。 |
| 查询 | `github repo [owner/repo]` | GitHub API | 查看仓库简介、Star、Fork、Issue、语言和默认分支。 |
| 查询 | `github view [目标]` | GitHub API | 查看仓库、Issue、PR、Commit 或 Release；目标也可以是 GitHub URL。 |
| 查询 | `github link [目标]` | GitHub API | 获取仓库、Issue 或 PR 的 GitHub 链接。 |
| 查询 | `github readme [owner/repo]` | GitHub API | 查看仓库 README。 |
| 查询 | `github license [owner/repo]` | GitHub API | 查看仓库许可证。 |
| 查询 | `github content <owner/repo> <文件路径>` | GitHub API | 查看仓库内的文本文件。 |
| 查询 | `github release [owner/repo] [tag]` | GitHub API | 查看最新 Release 或指定 tag；只有一个无斜杠参数时视为 tag。 |
| 查询 | `github deployments [owner/repo]` | GitHub API | 查看最近 10 个 Deployment；带仓库参数时也可使用 `deployment`。 |
| 查询 | `github diff [目标]` | GitHub API | 查看 Pull Request Diff。 |
| 仓库操作 | `github star [owner/repo]` | OAuth 授权 | Star 仓库。 |
| 仓库操作 | `github unstar [owner/repo]` | OAuth 授权 | 取消 Star 仓库。 |
| Issue/PR | `github comment [目标] <内容>` | OAuth 授权 | 评论 Issue 或 PR。 |
| Issue/PR | `github label [目标] <标签 ...>` | OAuth 授权 | 添加一个或多个标签。 |
| Issue/PR | `github unlabel [目标] <标签 ...>` | OAuth 授权 | 删除一个或多个标签。 |
| Issue/PR | `github close [目标] [原因]` | OAuth 授权 | 关闭 Issue 或 PR；提供原因时会先发布评论。 |
| Issue/PR | `github reopen [目标]` | OAuth 授权 | 重新开启 Issue 或 PR。 |
| Pull Request | `github approve [目标] [审核意见]` | OAuth 授权 | 批准 Pull Request。 |
| Pull Request | `github merge [目标] [提交标题]` | OAuth 授权 | 使用 merge 方式合并 Pull Request。 |
| Pull Request | `github squash [目标] [提交标题]` | OAuth 授权 | 使用 squash 方式合并 Pull Request。 |
| Pull Request | `github rebase [目标] [提交标题]` | OAuth 授权 | 使用 rebase 方式合并 Pull Request。 |

### 参数省略规则

- `event` 订阅该事件的全部 action，`event/action` 只订阅指定 action。
- GitHub App 安装必须通过机器人私聊发起，群聊中执行 `github install` 会被拒绝。
- `bind` 设置本群默认仓库，标为 `[owner/repo]` 的查询可使用该默认值。
- Issue/PR 目标可以写成 `owner/repo#123` 或完整 GitHub URL。
- 回复一条包含 Issue 或 PR 链接的消息后，可以省略写操作、`view`、`link` 和 `diff` 的目标。
- GitHub 写操作记录属于 OAuth 授权对应的 GitHub 用户。

直接发送以下内容也会显示预览：

```text
owner/repo
owner/repo#123
https://github.com/owner/repo/issues/123
https://github.com/owner/repo/commit/sha
https://github.com/owner/repo/releases/tag/v1.0.0
```

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
| `adminUserIds` | QQ 侧操作员列表；群主和群管理员无需加入 | `[]` |
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

## 发布到 npm

仓库包含 `.github/workflows/publish.yml`，推送 `v*` 格式的 Tag 时会自动检查、测试、
构建、发布到 npm，并创建对应的 GitHub Release。

工作流使用 npm Trusted Publisher 的 OIDC 短期凭据，不需要 `NPM_TOKEN`。在 npm
包页面的 `Settings → Trusted publishing` 中添加 GitHub Actions Publisher：

- Organization or user：`zhongwen-4-fraq-plugins`
- Repository：`fraq-plugin-github`
- Workflow filename：`publish.yml`
- Environment：留空

字段区分大小写，必须与 GitHub 仓库和 `.github/workflows/publish.yml` 完全一致。
Trusted Publisher 需要 npm CLI 11.5.1+ 和 Node.js 22.14.0+；工作流固定使用满足要求的
Node.js 24 与 npm 11.10.1。

如果 npm 上还不存在该包，需要先由包所有者手动完成首次发布，随后才能在包设置页绑定
Trusted Publisher。绑定成功后应删除旧的发布 Token，后续发布全部通过 OIDC 完成。

发布前先更新 `package.json` 中的版本，然后创建完全一致的 Tag：

```bash
git tag v0.1.0
git push origin v0.1.0
```

工作流会检查 `v0.1.0` 是否与 `package.json` 的 `0.1.0` 一致；不一致时停止发布。
成功发布的包会包含 npm provenance 供应链证明。

Release 正文只包含从 Git commit 生成的更新日志。工作流会检查同一发布工作流的上次
运行结果：如果上次失败或被取消，会发出警告，并从最近一次成功运行对应的 commit
开始收集所有遗漏提交；如果从未成功运行，则收集当前 Tag 可达的完整提交历史。
如果 npm 已发布但创建 Release 的步骤失败，重新运行工作流会跳过已存在的 npm 版本，
继续创建或更新 Release。
