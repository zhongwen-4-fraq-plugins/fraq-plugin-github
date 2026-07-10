# fraq-plugin-github

把 GitHub App 收到的仓库事件推送到 QQ 群。

## 工作方式

1. GitHub App 选择要接收的事件，并安装到仓库。
2. GitHub 把事件发送到插件的 Webhook 地址。
3. 插件校验 Webhook 签名。
4. 插件按 QQ 群中的订阅设置转发事件。

GitHub App 已经统一管理 Webhook，因此插件不会为每个仓库重复创建传统 Webhook。

## 安装

```bash
pnpm add fraq-plugin-github @fraqjs/plugin-hono
```

## 创建 GitHub App

在 GitHub 的 Developer settings 中创建 GitHub App，然后完成以下设置：

- Webhook URL：`https://你的域名/github/app/webhook`
- Webhook secret：生成一段随机字符串，并妥善保存
- Repository permissions：根据所选事件授予只读权限
- Subscribe to events：选择需要推送的事件，例如 Push、Issues、Pull request、Release 和 Workflow run
- 创建后，把 App 安装到需要接收事件的仓库

Webhook URL 必须能从公网访问，并转发到 `@fraqjs/plugin-hono` 监听的端口。

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
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  adminUserIds: [123456789],
});

await ctx.start();
```

如果在 GitHub App 中使用了其他 Webhook 路径，可以同时修改插件配置：

```ts
app: {
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  webhookPath: '/custom/github/webhook',
}
```

## QQ 群命令

群管理员或 `adminUserIds` 中的用户可以修改订阅：

```text
github subscribe owner/repo
github unsubscribe owner/repo
```

所有群成员都可以查看当前订阅：

```text
github subscriptions
```

这里的“订阅”只决定事件转发到哪个 QQ 群。仓库仍需安装 GitHub App，并在 App 设置中选择对应事件。

## 配置项

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `app.webhookSecret` | GitHub App 的 Webhook secret | 必填 |
| `app.webhookPath` | 接收事件的 HTTP 路径 | `/github/app/webhook` |
| `subscriptionsFile` | QQ 群订阅数据文件 | `data/fraq-plugin-github.json` |
| `initialSubscriptions` | 启动时加入的初始订阅 | `{}` |
| `adminUserIds` | 允许管理订阅的 QQ 号 | `[]` |
| `allowGroupAdmins` | 是否允许群主和群管理员管理订阅 | `true` |

初始订阅示例：

```ts
initialSubscriptions: {
  '123456789': ['fraqjs/fraq'],
}
```

## 已优化显示的事件

- Push
- Issues
- Issue comment
- Pull request
- Release
- Workflow run

其他带有仓库信息的 GitHub App 事件也会使用通用格式推送。

## 安全建议

- Webhook secret 不要写入仓库，使用环境变量传入。
- 公网入口应使用 HTTPS。
- 只为 GitHub App 授予所需的最小权限。
- 只有可信用户才能加入 `adminUserIds`。

## 开发

```bash
pnpm check
pnpm test
pnpm build
```
