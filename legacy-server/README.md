# 旧 Windows / SQLite 版本

旧站 `http://134.175.148.243/` 保存原来的 SQLite 旅行记录，不和 CloudBase 双向同步。

CloudBase 验收完成后，旧服务使用 `READ_ONLY=1` 启动：服务端拒绝所有写入，页面顶部展示“历史只读版本”和 CloudBase 新站入口。数据库和 `data/backups/` 必须继续保留。

```powershell
$env:READ_ONLY = "1"
$env:CLOUDBASE_SITE = "https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com/"
node server.mjs
```

旧版发布包保存在本机 `output/deploy-private/suixing-deploy.zip`，其中不应加入腾讯云登录信息、邀请链接或恢复码。
