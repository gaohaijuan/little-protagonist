# 分级阅读迁移后的启动环境

这是源端准备的说明；本次未在皇后安装依赖或启动项目，所有首次运行和安装由父端取得目标电脑授权后执行。

## 基础环境

优先使用 Node.js 24 或更高的兼容版本。根 package.json 的 engines 写 >=18，但运营后台使用 node:sqlite，server/start.cjs 明确要求 Node 24；仅阅读预览可使用 Node 18。源端已有 Node v24.14.1。业务运行和预览构建没有 npm 第三方依赖，无需 npm install。不要复制源电脑的缓存或 node_modules。

## 本地阅读原型

进入项目根目录，执行 `node --version` 确认环境，再执行 `npm run preview`。该命令重建 preview/index.html 并启动本机 http://127.0.0.1:4173/ 。生成 HTML 已从迁移包排除，因此必须先构建；不要直接双击缺失的生成页面。

最新逐页分镜审阅入口：http://127.0.0.1:4173/?view=books-16-20&revision=storyboards-v2 。其他入口 `?view=first-five`、`?view=next-five`、`?view=books-11-15`。这些是审阅稿，不代表所有内容已上架或完成印刷验收。

## 阅读端及运营后台

Node 24 下执行 `npm run admin`，阅读入口 http://127.0.0.1:4180/ ，后台 http://127.0.0.1:4180/admin 。首次启动在目的电脑新建 `.local/admin-data`，不会恢复原电脑账号、订单、头像或打印文件。默认本机测试密码见 server/README.md；正式部署前按项目规则另设密码及 HTTPS 来源。

`.env.example` 只有示例，项目 npm 脚本不会自动加载 .env。如需配置，复制为不提交的 `.env`，填入目标电脑自己的值；执行 `node scripts/build-preview.cjs` 后可用 `node --env-file=.env server/start.cjs`。不要把真实 AppSecret、账号桥接密钥或支付密钥填写进前端配置。公开部署、站点发布、微信账号/支付接入不属于此次源端迁移。

## 微信与可选工具

微信开发者工具导入根 project.config.json；当前 appid=touristappid，前端账号/平台/后台配置为空，仅本地游客模式。使用自己的 AppID、云环境和域名时单独配置。cloudfunctions/account 的 wx-server-sdk=3.0.1 只有启用云账号时需要安装/部署。

开发校验可在获授权的目标环境运行 `npm run check` 和 `npm test`；浏览器验证还需要 Playwright 与 Chrome。一些测试和辅助脚本写死源电脑 Codex runtime 路径，详见 PORTABILITY.json，迁移后需使用目标电脑已提供的依赖或改为可配置路径。设置 NODE_PATH 不会修复写死的绝对 require 路径。部分 Python 审计/打包脚本需要 Pillow、numpy；不得为备份而自动安装。

## 必需资源及原型资料

preview/models 包含两个模型，preview/vendor 包含识别运行时、WASM、PDF工具、字体及许可证；全部随包带走，不依赖源电脑缓存。原型源码在 preview/，素材在 preview/art/ 与 art-samples/，故事稿及分镜在 content/。独立概念稿位于 output/illustration-samples/rain-v1/，其人物使用默认插画头像；浏览器脚本依赖绝对路径的情况同样列入 PORTABILITY.json。

静态手机站可由 `npm run build:site` 重建 sites/mobile-preview/dist；.openai/hosting.json 保留站点身份，但本次未部署或改站点权限。文稿站的 HTML 可由 scripts/render-personalized-manuscript.cjs 等对应脚本重建到 output/text；旧 sites/manuscript-review/dist 已排除，不应当当作独立完整业务应用。

## 下载后的核对

先核对外部交付记录里的 ZIP 或 git bundle SHA-256，再运行 `python migration/verify_migration.py` 检查项目每个交付文件的 SHA-256。它仅核对文件，不执行应用。文件清单不包含自身，以避免递归；清单本身由外层压缩包 SHA-256 与本地迁移 commit 固定。
