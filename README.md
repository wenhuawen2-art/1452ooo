# 向野 · 自驾旅行助手

手机优先的多人旅行清单网站。网页使用 CloudBase 匿名身份，无需注册；云函数负责成员鉴权，文档数据库保存旅行，静态托管提供 HTTPS 公网入口。

界面采用参考图的轻盈 iOS 视觉：空气感蓝色渐变、由蓝到白的页面过渡、半透明胶囊、大圆角卡片、圆形图标按钮和悬浮底部导航；同时保留安全区适配、至少 44px 的主要触控区域与减少动态效果支持。

## 当前线上地址

https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com/

腾讯云默认测试域名首次打开会显示风险提示，确认访问后即可使用。每趟旅行在“同行成员”中生成独立私密邀请链接。

## 工程结构

- `public/`：手机网页源码。
- `shared/`：网页和云函数共用的旅行规则。
- `cloudfunctions/suixing-api/`：创建、加入、同步、恢复、归档和删除业务。
- `cloudfunctions/suixing-backup/`：每天写入云存储的数据库快照。
- `cloudbase/`：函数安全规则和网关策略。
- `wechat-miniprogram/`：微信开发者工具可直接导入的小程序容器工程，加载当前 CloudBase 手机网页。
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

`npm.cmd run deploy` 会依次构建网页、覆盖发布两个云函数，并用安全发布模式上传静态网站；上传失败会回滚本次静态资源。

## 微信小程序开发工具

在微信开发者工具中导入 `wechat-miniprogram/`。当前工程通过小程序 `web-view` 加载已发布网页，因此网页发布后小程序会自动使用最新界面和功能。

提交审核前需要在 `wechat-miniprogram/project.config.json` 中填入正式小程序 AppID，并在微信公众平台的“开发管理 → 开发设置 → 业务域名”加入：

`https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com`

首次使用先运行 `node_modules\.bin\tcb.cmd login --flow web`，在腾讯云官方页面完成授权。项目不需要 SecretId、SecretKey 或 API Key。

## 数据和权限

- 集合：`trips`、`trip_members`、`trip_invites`、`recovery_codes`、`delete_challenges`。
- 五个集合均为 `ADMINONLY`，浏览器不能直接读取。
- `suixing-api` 只允许已登录身份调用，函数内继续校验旅行成员和创建者权限。
- `suixing-backup` 禁止客户端调用，只由管理端或定时器运行。
- 邀请和恢复链接相当于临时凭证，不提交到 GitHub。

## 备份

`suixing-backup` 每天 03:15 运行，快照保存到云存储 `backups/YYYY-MM-DD/`。创建者也可以在旅行设置中点“下载旅行备份”，把单趟旅行 JSON 保存到自己的设备。
