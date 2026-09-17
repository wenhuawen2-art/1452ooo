# 向野 · 自驾旅行助手

向野是手机优先的多人旅行准备工具，同时提供微信原生小程序和网页端。小程序使用微信 OpenID 静默识别账号；昵称和头像由用户在向野内设置，并在所有旅行和网页端统一显示。网页使用小程序扫码确认登录，不保存 OpenID、AppSecret 或长期登录令牌。

## 当前线上地址

https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com/

腾讯云默认测试域名首次打开可能显示风险提示。网页会生成五分钟有效、单次兑换的登录二维码，请在向野小程序“我的”页使用“扫一扫登录网页版”确认。

## 工程结构

- `public/`：网页端源码和扫码登录界面。
- `shared/`：网页和云函数共用的旅行规则。
- `cloudfunctions/suixing-api/`：统一账号、扫码登录、旅行、清单、天气、票据与权限接口。
- `cloudfunctions/suixing-backup/`：每天写入云存储的数据库快照。
- `cloudbase/`：函数调用权限和网关策略。
- `wechat-miniprogram/`：微信开发者工具可直接导入的原生小程序，不依赖 `web-view`。
- `legacy-server/`：旧 Windows/SQLite 版本说明；旧匿名数据不迁入新账号。
- `cloudbaserc.json`：CloudBase 声明式部署配置。

## 本地验证与发布

```powershell
npm.cmd install
npm.cmd test
npm.cmd run deploy:plan
npm.cmd run deploy
npm.cmd run cloudbase:secure
```

`npm.cmd run deploy` 会构建网页、覆盖发布两个云函数，并用安全发布模式上传静态网站。`cloudbase:secure` 关闭匿名登录，设置数据库为仅管理端访问，并按配置开放 `suixing-api` 的函数入口；所有业务权限仍由云函数使用稳定账号校验。

## 微信原生小程序

在微信开发者工具中导入 `wechat-miniprogram/`。工程 AppID 为 `wx3a3a8246a3a03c6d`，CloudBase 环境为 `zdata-d4g6l75lwebf2dbb0`。

小程序启动后通过 CloudBase 登录上下文读取微信身份，首次进入设置向野昵称和头像。旅行、成员、清单、天气、住宿、定位、票据、邀请、备份和日历导出均为原生页面与原生能力。

发布前需确认：

1. 微信小程序已关联上述 CloudBase 环境，并启用微信小程序登录。
2. CloudBase 自定义登录可用，网页扫码确认后可签发一次性自定义登录票据。
3. 在体验版使用两个真实微信测试创建旅行、分享邀请、加入、换机恢复与数据隔离。
4. 微信开发者工具上传的版本、Git 提交和 CloudBase 发布版本一致后再提交审核。

原生小程序不再通过 `web-view` 访问网页，因此不需要把静态站点配置为小程序业务域名。若将来新增 `wx.request` 直连第三方接口，再按实际接口配置 request 合法域名；目前天气与地理解析均由云函数代理。

## 数据和权限

- 核心集合：`user_accounts`、`trip_members`、`trips`、`trip_invites`、`web_login_sessions`、`weather_cache`、`delete_challenges`、`recovery_codes`。
- 数据库集合均为 `ADMINONLY`，客户端不能直接读取。
- `trip_members` 使用稳定的 `accountId + tripId` 关联成员身份；客户端不能提交或伪造 OpenID。
- `suixing-api` 允许函数入口调用，以支持网页创建和轮询短时登录会话；除扫码会话创建、轮询和兑换外，其余接口均要求服务端解析出的微信或自定义登录身份。
- `suixing-backup` 禁止客户端调用，只由管理端或定时器运行。
- 旧匿名账号记录不迁移、不删除，只保留为回滚备份。

## 备份

`suixing-backup` 每天 03:15 运行，快照保存到云存储 `backups/YYYY-MM-DD/`。旅行创建者可以在小程序和网页导出单趟旅行 JSON；小程序也可以导出 `.ics` 行程日历文件。
