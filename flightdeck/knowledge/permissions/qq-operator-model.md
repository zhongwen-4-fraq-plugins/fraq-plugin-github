# QQ 操作权限检查清单
SUMMARY: 任何会改变群配置或 GitHub 状态的命令都必须限制为配置列表成员或当前群管理；GitHub 写操作还必须有用户 OAuth。
READ WHEN: before any addition or change to a state-changing QQ command

---

QQ 侧操作员满足任一条件即可：

- QQ 号在 `adminUserIds` 配置列表中；
- 当前会话是群聊，用户角色为群主或群管理员。

群管理权限始终生效，不提供关闭开关。普通用户可以使用只读查询和自己的 OAuth
授权管理，但不能修改群绑定、事件订阅、App 安装或 GitHub 状态。

GitHub 写操作使用 `userToken(session)`，它先检查 QQ 操作权限，再检查当前 QQ
用户是否完成 OAuth。只读但需要用户 token 的功能应显式调用
`userToken(session, false)`，避免误加 QQ 管理限制。
