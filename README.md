# fraq-plugin-github

为 [Fraq](https://fraq.dev/) 提供 GitHub 集成：在 QQ 群中订阅仓库事件、查看仓库与 README、截取 GitHub 网页，并通过命令调用 GitHub REST 和 GraphQL API。

## 功能

- 将一个或多个 GitHub 仓库绑定到 QQ 群，绑定关系自动持久化。
- 创建 `events: ['*']` 的仓库 Webhook，接收并转发全部 GitHub 事件。
- 订阅、取消订阅及查看当前群的订阅列表。
- 查看仓库概况和 README；支持从回复消息中的 GitHub 链接识别仓库。
- 在群内批准或合并 Pull Request，可使用群订阅仓库作为默认仓库。
- 使用 Playwright 截取仓库、Issue、Pull Request 等 GitHub 页面。
- 通过通用命令调用 GitHub JSON REST API 和 GraphQL API。
- 校验 Webhook SHA-256 签名，并过滤重复的 Delivery ID。
- 支持自定义 GitHub API 代理和网页地址。

## 环境要求

- Node.js 22 或更高版本。
- Fraq `^0.13.0`。
- `@fraqjs/plugin-hono`，用于接收 GitHub Webhook。
- 可被 GitHub 访问的 HTTPS 地址，订阅 Webhook 时需要。
- Chromium，使用网页截图功能时需要。

## 安装

```bash
pnpm add fraq-plugin-github @fraqjs/plugin-hono
pnpm exec playwright install chromium
```

如果服务器已经安装 Chromium，可以跳过浏览器下载，并通过 `screenshot.executablePath` 指定可执行文件。

## 快速开始

```ts
import HonoPlugin from '@fraqjs/plugin-hono';
import { Context } from '@fraqjs/fraq';
import GitHubPlugin from 'fraq-plugin-github';

const ctx = Context.fromUrl('http://127.0.0.1:30001');

ctx.install(HonoPlugin, {
  host: '0.0.0.0',
  port: 4649,
});

ctx.install(GitHubPlugin, {
  token: process.env.GITHUB_TOKEN,
  adminUserIds: [123456789],
  webhook: {
    publicUrl: 'https://bot.example.com',
    path: '/github/webhook',
    secret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
});

await ctx.start();
```

确保 `https://bot.example.com/github/webhook` 能够转发到 Hono 服务的 `4649` 端口。Token 和 Webhook Secret 应通过环境变量传入，不要直接写入仓库。

启动机器人后，在目标 QQ 群中执行：

```text
github subscription subscribe fraqjs/fraq
```

该命令会在 GitHub 仓库侧创建或更新全事件 Webhook，并将仓库订阅到当前群。

## GitHub Token 权限

推荐使用 Fine-grained Personal Access Token 或 GitHub App Token，并按实际需求授予最小权限：

- 自动创建或更新订阅：目标仓库的 Webhooks 读写权限。
- 读取私有仓库及 README：目标仓库的 Metadata 和 Contents 读取权限。
- REST / GraphQL 写操作：对应 GitHub API 所要求的权限。
- 批准或合并 Pull Request：目标仓库的 Pull requests 写权限。

未配置 Token 时仍可读取公开仓库，但会受到 GitHub 未认证请求的速率限制，且无法使用自动 Webhook 订阅。

## 配置

```ts
ctx.install(GitHubPlugin, {
  token: process.env.GITHUB_TOKEN,
  adminUserIds: [123456789],
  allowGroupAdmins: true,
  bindingsFile: 'data/fraq-plugin-github.json',
  initialBindings: {
    '123456789': ['fraqjs/fraq'],
  },
  apiBaseUrl: 'https://api.github.com',
  webBaseUrl: 'https://github.com',
  maxReplyLength: 3500,
  webhook: {
    path: '/github/webhook',
    publicUrl: 'https://bot.example.com',
    secret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  screenshot: {
    executablePath: undefined,
    width: 1440,
    height: 1000,
    timeoutMs: 30000,
  },
});
```

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `token` | GitHub Fine-grained PAT 或 GitHub App Token | 无 |
| `adminUserIds` | 允许执行管理命令的 QQ 号 | `[]` |
| `allowGroupAdmins` | 是否允许群主和群管理员执行管理命令 | `true` |
| `bindingsFile` | 群订阅关系的 JSON 持久化文件 | `data/fraq-plugin-github.json` |
| `initialBindings` | 启动时合并的初始群订阅 | `{}` |
| `apiBaseUrl` | GitHub REST / GraphQL API 根地址或兼容代理 | `https://api.github.com` |
| `webBaseUrl` | GitHub 网页根地址和截图允许的主机 | `https://github.com` |
| `maxReplyLength` | API 与 README 文本回复的最大长度 | `3500` |
| `webhook.path` | Hono 接收 Webhook 的路径 | `/github/webhook` |
| `webhook.publicUrl` | GitHub 能访问的公网服务根地址 | 无 |
| `webhook.secret` | 校验 `X-Hub-Signature-256` 的密钥 | 配置 Webhook 时必填 |
| `screenshot.executablePath` | 已安装 Chromium 的可执行文件路径 | Playwright 默认浏览器 |
| `screenshot.width` | 截图视口宽度 | `1440` |
| `screenshot.height` | 截图视口高度 | `1000` |
| `screenshot.timeoutMs` | 页面加载和等待超时 | `30000` |

`initialBindings` 的键是 QQ 群号，值是仓库列表。仓库统一使用 `owner/repo` 格式：

```ts
initialBindings: {
  '123456789': ['fraqjs/fraq', 'octocat/Hello-World'],
  '987654321': ['*'],
}
```

`*` 表示把所有收到的仓库事件转发到该群，可能产生大量消息，请谨慎使用。

## 命令

### 订阅管理

推荐使用统一的 `github subscription` 命令组：

| 命令 | 权限 | 说明 |
| --- | --- | --- |
| `github subscription subscribe <owner/repo>` | 管理员 | 创建或更新全事件 Webhook，并订阅到当前群 |
| `github subscription unsubscribe <owner/repo>` | 管理员 | 停止向当前群转发该仓库事件 |
| `github subscription list` | 所有人 | 查看当前群的全部订阅 |

`subscribe` 可简写为 `add`，`unsubscribe` 可简写为 `remove`：

```text
github subscription add fraqjs/fraq
github subscription remove fraqjs/fraq
```

为了兼容旧用法，也可以使用：

```text
github subscribe <owner/repo>
github unsubscribe <owner/repo>
github subscriptions
```

取消订阅只移除当前群的转发关系，不会删除 GitHub 仓库侧的 Webhook，以免影响其他仍在订阅该仓库的群。

### 仓库与 README

| 命令 | 权限 | 说明 |
| --- | --- | --- |
| `github repo <owner/repo>` | 所有人 | 查看仓库描述、语言、可见性、Star、Fork 和 Issue 数量 |
| `github readme <owner/repo>` | 所有人 | 查看指定仓库 README |
| `github readme` | 所有人 | 当前群只绑定一个仓库时，直接查看该仓库 README |

还可以回复一条包含 GitHub 仓库链接的消息并发送：

```text
github readme
```

插件会从被回复消息中提取 `owner/repo`。

### 网页截图

```text
github shot fraqjs/fraq
github shot https://github.com/fraqjs/fraq/issues
```

回复一条包含 GitHub 链接的消息并发送 `github shot` 也可以截图。为防止 SSRF，插件只允许访问 `webBaseUrl` 对应主机上的 HTTPS 页面。

### Pull Request 操作

群管理员或插件管理员可以直接批准和合并 Pull Request：

```text
github pr approve [owner/repo] <PR编号> [审核意见]
github pr merge [owner/repo] <PR编号> [merge|squash|rebase]
```

示例：

```text
github pr approve fraqjs/fraq 123 代码检查通过
github pr merge fraqjs/fraq 123 squash
```

当前群只订阅一个仓库时，可以省略仓库：

```text
github pr approve 123 代码检查通过
github pr merge 123 rebase
```

省略合并方式时默认使用 `squash`。批准不会自动合并；GitHub 也不允许用户批准自己创建的 Pull Request。Token 必须具有目标仓库的 Pull requests 写权限，分支保护规则仍然正常生效。

GitHub 上的审批和合并记录会归属于 Token 对应的 GitHub 用户，而不是发出命令的 QQ 用户。建议只为可信管理员开放，并在部署层记录群命令操作日志。

### REST API

```text
github api <GET|POST|PUT|PATCH|DELETE|HEAD> <API path> [JSON body]
```

示例：

```text
github api GET /repos/fraqjs/fraq/issues?state=open
github api POST /repos/owner/repo/issues {"title":"由 QQ 创建的 Issue","body":"Issue 内容"}
github api PATCH /repos/owner/repo/issues/1 {"state":"closed"}
```

REST 命令覆盖接受 JSON 请求体的 GitHub API。Release Asset 等需要二进制上传的端点不在命令支持范围内。

### GraphQL API

GraphQL 命令接受包含 `query` 和可选 `variables` 的 JSON 对象：

```text
github graphql {"query":"query { viewer { login } }"}
```

```text
github graphql {"query":"query($owner:String!,$name:String!){repository(owner:$owner,name:$name){stargazerCount}}","variables":{"owner":"fraqjs","name":"fraq"}}
```

### 其他兼容命令

| 命令 | 说明 |
| --- | --- |
| `github bind <owner/repo>` | 只创建当前群的本地绑定，不注册 GitHub Webhook |
| `github unbind <owner/repo>` | 删除当前群的本地绑定 |
| `github bindings` | 查看当前群的本地绑定 |
| `github help` | 查看机器人内置帮助 |

## 权限模型

以下操作属于管理操作：

- 创建或取消订阅。
- 创建或删除本地绑定。
- 批准或合并 Pull Request。
- 调用通用 REST 和 GraphQL API。

满足以下任一条件的用户可以执行管理操作：

- QQ 号位于 `adminUserIds`；
- 当前会话是群聊、`allowGroupAdmins` 为 `true`，且用户是群主或群管理员。

仓库信息、README、截图和订阅列表属于只读操作，普通成员也可以使用。

## Webhook 工作方式

订阅命令会向 GitHub 创建或更新如下 Webhook：

```json
{
  "name": "web",
  "active": true,
  "events": ["*"],
  "config": {
    "url": "https://bot.example.com/github/webhook",
    "content_type": "json",
    "secret": "<webhook.secret>"
  }
}
```

收到事件后，插件会：

1. 校验 `X-Hub-Signature-256`；
2. 根据 `X-GitHub-Delivery` 过滤近期重复投递；
3. 读取 `repository.full_name`；
4. 将事件摘要发送到所有订阅该仓库的 QQ 群。

Push、Issue、Issue Comment、Pull Request、Release、Workflow Run、Fork、Star、Create 和 Delete 事件有专用摘要，其他事件使用通用摘要，因此后续新增的 GitHub 事件也可以转发。

## 自定义 GitHub 地址

可以配置自定义网页主机和兼容 GitHub API 路径的代理：

```ts
ctx.install(GitHubPlugin, {
  token: process.env.GITHUB_TOKEN,
  apiBaseUrl: 'https://github-api.example.com',
  webBaseUrl: 'https://github.example.com',
});
```

REST 请求会拼接为 `${apiBaseUrl}/repos/...`，GraphQL 请求会发送到 `${apiBaseUrl}/graphql`。GitHub Enterprise 原生 REST 与 GraphQL 路径通常不同；如需同时使用两者，应在前方配置兼容这两种路径的代理。

## 常见问题

### `github subscription subscribe` 提示未配置 Token

自动创建 Webhook 必须配置 `token`，并确保 Token 对目标仓库具有 Webhooks 读写权限。

### 提示未配置 `webhook.publicUrl`

`publicUrl` 必须是 GitHub 能访问的公网 HTTPS 根地址。使用 Nginx、Caddy 或 Cloudflare Tunnel 时，需要把 `webhook.path` 转发到 Hono 服务。

### 截图提示找不到浏览器

安装 Playwright Chromium：

```bash
pnpm exec playwright install chromium
```

也可以配置 `screenshot.executablePath` 使用已有浏览器。

### README 没有指定仓库

可以显式传入 `owner/repo`、回复包含 GitHub 链接的消息，或者先让当前群只绑定一个仓库。

### 群里收不到事件

依次确认：

1. `github subscription list` 中存在目标仓库；
2. GitHub 仓库 Webhook 页面最近一次投递成功；
3. 公网反向代理已把 `webhook.path` 转发到 Hono；
4. GitHub Webhook Secret 与插件配置一致；
5. 机器人有目标群的发言权限。

## 开发

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

- `pnpm check`：运行 Biome 和 TypeScript 严格检查。
- `pnpm test`：运行仓库解析、绑定持久化、Webhook 签名、订阅及事件转发测试。
- `pnpm build`：使用 tsdown 生成 ESM 和类型声明。

## 安全建议

- 使用最小权限 Token，并定期轮换。
- 不要在日志、聊天消息或 Git 仓库中暴露 Token 与 Webhook Secret。
- 谨慎开放 `allowGroupAdmins`；通用 API 命令可以执行删除仓库、修改权限等高风险操作。
- 为 Webhook 公网入口配置 HTTPS、请求体大小限制和访问日志。
- 定期检查不再使用的 GitHub Webhook。取消群订阅不会自动删除仓库侧 Webhook。

## License

MIT
