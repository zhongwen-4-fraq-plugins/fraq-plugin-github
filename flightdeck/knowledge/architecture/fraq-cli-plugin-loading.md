# Fraq CLI 插件加载检查清单
SUMMARY: 始终让插件包名、默认导出、JSON 配置对象和 peer 插件依赖符合 Fraq CLI 生成的启动脚本。
READ WHEN: before any change to the plugin entrypoint, package metadata, dependencies, or configuration surface

---

Fraq CLI 0.7.0 从 `fraq.yml` 的 `plugins` 键生成 npm 包名：`github` 对应
`fraq-plugin-github`，`fraqjs/hono` 对应 `@fraqjs/plugin-hono`。它安装生成的依赖后，
通过 `(await import(packageName)).default` 取得插件，并执行
`context.install(defaultExport, jsonSerializableOptions)`。

因此本插件必须同时满足：

- `package.json` 的 `main` 指向可导入的 ESM 构建产物；
- 包入口提供 `definePlugin(...)` 的默认导出，插件名保持为 `github`；
- `apply` 的第二个参数是单个 JSON 可序列化配置对象，不能在插件配置中暴露函数；
- `@fraqjs/plugin-hono` 保留在 `peerDependencies`，使 CLI 能诊断并排序插件依赖；
- `@fraqjs/fraq` 的 peer 版本与使用的 Hono 插件版本兼容；
- `fraq.category` 保留有效的插件市场分类。

修改入口或依赖后，构建 `dist`，再以动态导入 `dist/index.mjs` 的方式取得 `.default`，
用经过 JSON 序列化的配置调用 `ctx.install` 并完成一次启动/停止验证。
