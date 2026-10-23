# 分级阅读项目源端交接

项目：小小主角（中文分级阅读、个性化绘本），源电脑皇上 DESKTOP-O3TF6TU，源目录 `C:\Users\Administrator\Documents\ChatGPT\分级阅读`。当前副本为安全迁移快照，原项目未删除、未重置、未切分支；全部原始未提交工作留在源端。

## 发布状态

尚未上传 GitHub，未创建远端分支，没有远端 commit SHA。原项目为未产生首次提交的 master，0个已跟踪文件、1750条未跟踪状态记录，无 remotes。两个原型站点子仓库也无 remotes。现有可见 GitHub 仓库已核对，没有被验证为此项目的私有仓库；不应把此项目放进 My-Path、rainbow-cargo 或 water-sort 等游戏仓库，也未新建仓库。

下一步须由父端/用户确认专属私有仓库的准确 owner/repo，或明确授权创建一个私有仓库。待确认后，将此安全副本完整发布到 `migration/graded-reading-20261023`；同名已存在时先核对，再用新时间戳后缀。不得改 main、force push、改变可见性或仓库权限。发布前再核实仓库 private=true、分支和资源清单；发布后核实远端 SHA 与文件清单。本次仅创建本地同名迁移分支作为可恢复状态，准确本地 SHA 记录于交付目录 COMMIT.json，不能称作远端 SHA。

## 覆盖范围

保留 miniprogram、cloudfunctions、admin、server、scripts、tests、content、docs、AGENTS.md、README.md、项目配置、preview 原型源码、preview/art 所有运行插画、art-samples 原生素材/未采用版本/提示词/分镜、模型、WASM、字体与许可证。保留雨天概念原型的原生图层、参考页面和源脚本，以及 output/text 中的编辑工具及历史文稿 JSON、tmp 中的源脚本。详细原路径、大小和 SHA-256 见 migration/SOURCE_MANIFEST.json；覆盖计数见 SOURCE_STATE.json。

源端两个静态站的 .openai/hosting.json 作为现有身份配置保留。排除 .git 历史、缓存、node_modules、dist、一般生成输出、测试/QA截图、真实 .env/密钥、浏览器资料、数据库、头像样本、个性化 PDF/打印包。排除类别及计数见 migration/EXCLUSIONS.json。私密数据库、联系资料、照片或成品若另需迁移，必须另行确认安全传输方式，本包不含这些资料。未读取禁止的 sessions，也没有打包系统目录。

## 内容和工程边界

先读 AGENTS.md、README.md、server/README.md 和 migration/STARTUP.md。统一人物比例、真实头像不重绘、分批合成、A5打印以及6故事样册范围均受项目现有规则约束。微信原生端与浏览器功能不完全一致，不能据浏览器样稿声称微信端已完成同等功能；第16—20篇最新逐页分镜在 content/books-16-20-storyboards-v2.json 与 art-samples/books-16-20-storyboards-v2/。

根运行不需要业务依赖安装；后台需要 Node 24。部分辅助脚本/浏览器测试有源电脑绝对路径，需皇后获授权后按 migration/PORTABILITY.json 处理。迁移没有改变业务源码来掩盖这些差异。

本次验证只覆盖安全筛查、逐文件复制哈希、资源校验和、压缩包逐文件哈希及本地 Git 清单，不运行未知项目代码、安装软件、测试账号/订单或部署服务。没有操作皇后，未证明皇后能够运行。父端收到该包后，需先获目标电脑授权，再下载/核对/启动并给出实际运行证据。
