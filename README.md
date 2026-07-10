# fraq-plugin-github

面向 [Fraq](https://fraq.dev/) 的 GitHub 集成插件。支持将仓库绑定到 QQ 群、订阅并转发 GitHub 全部 Webhook 事件、查看仓库与 README、截取 GitHub 网页，以及通过命令调用任意 GitHub REST / GraphQL API。

## 安装

```bash
pnpm add fraq-plugin-github @fraqjs/plugin-hono
pnpm exec playwright install chromium
```

插件需要 `@fraqjs/plugin-hono` 接收 GitHub Webhook。Playwright 首次使用前需要安装 Chromium；也可以通过 `screenshot.executablePath` 使用服务器上已有的 Chromium。

## 配置

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
  allowGroupAdmins: true,
  bindingsFile: 'data/fraq-plugin-github.json',
  webhook: {
    path: '/github/webhook',
    publicUrl: 'https://bot.example.com',
    secret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  screenshot: {
    width: 1440,
    height: 1000,
    timeoutMs: 30000,
  },
});

await ctx.start();
```

### 配置项

| 配置 | 说明 | 默认值 |
| --- | --- | --- |
| `token` | GitHub Fine-grained PAT 或 GitHub App Token | 无 |
| `adminUserIds` | 可执行 REST、GraphQL、绑定和订阅操作的 QQ 号 | `[]` |
| `allowGroupAdmins` | 是否允许群主和群管理员执行管理操作 | `true` |
| `bindingsFile` | 群绑定持久化文件 | `data/fraq-plugin-github.json` |
| `initialBindings` | 初始群绑定，格式为 `{ "群号": ["owner/repo"] }` | `{}` |
| `apiBaseUrl` | GitHub API 地址，可用于 GitHub Enterprise | `https://api.github.com` |
| `webBaseUrl` | GitHub 网页地址，可用于 GitHub Enterprise | `https://github.com` |
| `maxReplyLength` | 文本响应最大长度 | `3500` |
| `webhook.path` | Webhook HTTP 路径 | `/github/webhook` |
| `webhook.publicUrl` | GitHub 能访问的公网服务根地址 | 无 |
| `webhook.secret` | 用于校验 `X-Hub-Signature-256` 的密钥 | 必填 |

`token` 的权限决定通用 API 命令最终能执行哪些操作。自动订阅 Webhook 至少需要目标仓库的 Webhook 读写权限；读取私有仓库 README 需要相应 Contents 权限。

## 命令

```text
github help
github repo <owner/repo>
github readme [owner/repo]
github shot <owner/repo|GitHub HTTPS URL>
github bind <owner/repo>
github unbind <owner/repo>
github bindings
github subscribe <owner/repo>
github api <GET|POST|PUT|PATCH|DELETE|HEAD> <API path> [JSON body]
github graphql <{"query":"...","variables":{...}}>
```

示例：

```text
github bind fraqjs/fraq
github subscribe fraqjs/fraq
github readme fraqjs/fraq
github shot https://github.com/fraqjs/fraq/issues
github api GET /repos/fraqjs/fraq/issues?state=open
github api POST /repos/owner/repo/issues {"title":"由 QQ 创建的 Issue","body":"Issue 内容"}
github graphql {"query":"query { viewer { login } }"}
```

回复一条包含 GitHub 仓库链接的消息，再发送 `github readme` 或 `github shot`，插件会从被回复消息中提取仓库或页面地址。

## Webhook 行为

`github subscribe owner/repo` 会完成两件事：

1. 将仓库绑定到当前 QQ 群；
2. 在仓库中创建或更新指向 `webhook.publicUrl + webhook.path` 的 Webhook，并设置 `events: ['*']`。

插件会验证每次投递的 SHA-256 签名，忽略重复的 Delivery ID，并把所有包含 `repository.full_name` 的事件转发到对应绑定群。常见事件会使用专用摘要，其他事件使用通用摘要，因此新增加的 GitHub 事件也能正常转发。

可以在 `initialBindings` 或绑定文件中使用 `*`，将所有收到的仓库事件转发到指定群。请谨慎使用，避免消息过多。

## 安全说明

- REST 和 GraphQL 命令可以执行删除仓库、修改权限等高风险操作，只对插件管理员或允许的群管理员开放。
- Token 和 Webhook Secret 只应通过环境变量传入，不要提交到仓库。
- 截图仅允许 `webBaseUrl` 对应主机上的 HTTPS 页面，避免将浏览器用作任意地址访问代理。
- README、仓库查询和截图属于只读命令，普通群成员可以使用。
