# 随行 · 自驾旅行助手

手机优先的多人旅行清单网站。网页使用 CloudBase 匿名身份，无需注册；云函数负责成员鉴权，文档数据库保存旅行，静态托管提供 HTTPS 公网入口。

## 当前线上地址

https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com/

腾讯云默认测试域名首次打开会显示风险提示，确认访问后即可使用。每趟旅行在“同行成员”中生成独立私密邀请链接。

## 工程结构

- `public/`：手机网页源码。
- `shared/`：网页和云函数共用的旅行规则。
- `cloudfunctions/suixing-api/`：创建、加入、同步、恢复、归档和删除业务。
- `cloudfunctions/suixing-backup/`：每天写入云存储的数据库快照。
- `cloudbase/`：函数安全规则和网关策略。
- `legacy-server/`：旧 Windows/SQLite 版本说明；旧数据不迁入 CloudBase。
- `cloudbaserc.json`：CloudBase 声明式部署配置。

## 本地验证与发布

```powershell
npm.cmd install
npm.cmd test
npm.cmd run deploy:plan
npm.cmd run deploy
npm.cmd run cloudbase:secure
```

首次使用先运行 `node_modules\.bin\tcb.cmd login --flow web`，在腾讯云官方页面完成授权。项目不需要 SecretId、SecretKey 或 API Key。

## 数据和权限

- 集合：`trips`、`trip_members`、`trip_invites`、`recovery_codes`、`delete_challenges`。
- 五个集合均为 `ADMINONLY`，浏览器不能直接读取。
- `suixing-api` 只允许已登录身份调用，函数内继续校验旅行成员和创建者权限。
- `suixing-backup` 禁止客户端调用，只由管理端或定时器运行。
- 邀请和恢复链接相当于临时凭证，不提交到 GitHub。

## 备份

`suixing-backup` 每天 03:15 运行，快照保存到云存储 `backups/YYYY-MM-DD/`。创建者也可以在旅行设置中点“下载旅行备份”，把单趟旅行 JSON 保存到自己的设备。
