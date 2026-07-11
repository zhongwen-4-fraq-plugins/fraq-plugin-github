# QQ 群配置权限检查清单
SUMMARY: 修改群配置或 App 安装的命令必须限制为配置列表成员或当前群管理；个人 GitHub 写操作只检查 OAuth。
READ WHEN: before any addition or change to a QQ command that modifies group configuration or App installation

---

QQ 侧操作员满足任一条件即可：

- QQ 号在 `adminUserIds` 配置列表中；
- 当前会话是群聊，用户角色为群主或群管理员。

群管理权限始终生效，不提供关闭开关。普通用户不能修改群绑定、事件订阅或 App
安装，但可以使用只读查询，并在完成个人 OAuth 后执行 GitHub 写操作。

GitHub 写操作使用 `userToken(session)`，只检查当前 QQ 用户是否完成 OAuth。群配置
和 App 安装命令应显式调用 `requireOperator(session, service)`。

`github install` 只允许在非群聊会话中生成安装链接，避免在群内公开安装入口；安装
状态检查仍可在群内进行，卸载则继续使用 QQ 操作员权限。
