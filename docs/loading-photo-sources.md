# 加载动画 V2：照片来源与许可

下载与许可核对：2026-10-10。全部来自 Pexels 标注 Free / Free to use 的照片页；按 Pexels License 可免费用于个人和商业项目。照片仍有版权，不应称作公有领域或 CC0。

许可：https://www.pexels.com/license/ （官方页面亦可由 https://www.pexels.com/legal-pages/license/ 访问）

仅作为向野加载界面的装饰缩略图，不作为独立图库销售，不暗示摄影者代言。未使用用户照片。图片以 160px 缩略图打包，离线加载。

| 文件 ID | 内容 | 来源 |
| --- | --- | --- |
| 346529 | 山湖 / Bri Schneiter | https://www.pexels.com/photo/calm-body-of-lake-between-mountains-346529/ |
| 11227879 | 热带海岸 / Antonio Florentini | https://www.pexels.com/photo/aerial-view-of-a-beach-11227879/ |
| 23522919 | 沙丘 / Henrik Le-Botos | https://www.pexels.com/photo/sand-dunes-in-desert-23522919/ |
| 9159989 | 林间露营 / Darina Belonogova | https://www.pexels.com/photo/camping-tent-in-forest-9159989/ |
| 1309584 | 露营地 / Lukas Blazek | https://www.pexels.com/photo/tents-surrounded-by-trees-1309584/ |
| 5633460 | 山间公路 | https://www.pexels.com/photo/landscape-with-rocky-mountains-and-winding-road-5633460/ |
| 27275527 | 热气球 | https://www.pexels.com/photo/cappadocia-27275527/ |
| 10130123 | 冰岛瀑布 | https://www.pexels.com/photo/waterfall-in-nature-10130123/ |
| 4784289 | 海滩航拍 / Jess Loiterton | https://www.pexels.com/photo/aerial-view-of-beach-near-palm-trees-4784289/ |
| 39965293 | 雪山倒影 / Adem Albayrak | https://www.pexels.com/photo/scenic-mountain-landscape-with-lake-reflection-39965293/ |

本地文件：`wechat-miniprogram/miniprogram/assets/loading-photos/{ID}.jpg`。

## 版本对比

- V1 原始模板、样式和数据完整保存在 `docs/loading-v1/`；原 SVG 素材保留。预览 http://127.0.0.1:4191/?mode=loading-v1 。
- V2 默认使用真实照片，30 个碎片、六条非对称轨迹、不同周期与旋转方向。移除加载提示、标语和页脚，只保留中心“向野”。预览 http://127.0.0.1:4191/?mode=loading 。
- 保持真实加载状态结束后立即关闭、后台暂停和减少动态效果支持，不加入人为等待。
