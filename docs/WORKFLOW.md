# 开发流程与协作约束

状态：**已确认**（用户 2026-11-06 确认）。之后修改本文件须经用户同意。

本文件与 `AGENTS.md`（产品与制作规范）、`docs/ART-STYLE.md`（锁定画风）同级，三者同时生效。每次新会话——无论是 Claude 还是 Codex——开工前都必须先读这三份文件。发生冲突时，以用户在会话中的最新明确指示为准，然后同步修改文件。

## 1. 角色

| 角色 | 职责 | 不做的事 |
| --- | --- | --- |
| 用户（产品负责人） | 确定范围与优先级；**终审每一张图片**；验收功能；批准推送、发布、对外操作 | — |
| Claude（主导/协调） | 制定计划；拆分任务并写任务卡；通过 Orca 派发给 Codex；审核代码改动和验证证据；图片初审；向用户汇报、提交审图；维护本文件、`AGENTS.md`、`README.md` 及任务看板 | 不直接写业务代码，不作图，不以任何方式代替用户审图通过 |
| Codex（Windows，执行） | 按任务卡开发、作图、自测，提交证据和改动说明 | 不擅自扩大任务范围，不跳过审图关卡，不推送、发布或对外操作，不修改本文件 |

## 2. 派发方式（Orca）

Claude 只通过 Orca 给 Windows 上的 Codex 下达指令。Windows 主机已在本机 Orca 中保存为环境 `windows`；项目目录为 `C:/Users/Administrator/Documents/ChatGPT/分级阅读绘本/little-protagonist`（Windows 原生，Node 24，远程同为 `gaohaijuan/little-protagonist`），仓库编号 `3458315d-27b5-487d-8fbc-a74b62765c54`。

当前版本的 Orca 不支持跨主机的 `orchestration worker-start`（报 `server_required`），所以改用下面的方式（命令前须清除会话变量，否则报 `session_caller_host_boundary`）：

```text
env -u ORCA_AGENT_SESSION_ID -u ORCA_AGENT_SESSION_SPAWN_TOKEN <ORCA> agent launch --environment windows --agent codex \
  --worktree "id:3458315d-27b5-487d-8fbc-a74b62765c54::C:/Users/Administrator/Documents/ChatGPT/分级阅读绘本/little-protagonist" \
  --surface terminal --prompt "$(cat docs/tasks/<任务编号>.md)" --json
# 读取结果
env -u ORCA_AGENT_SESSION_ID -u ORCA_AGENT_SESSION_SPAWN_TOKEN <ORCA> terminal read --environment windows --terminal <handle> --json
# 追加指令
env -u ORCA_AGENT_SESSION_ID -u ORCA_AGENT_SESSION_SPAWN_TOKEN <ORCA> terminal send --environment windows --terminal <handle> --text "<内容>" --enter --json
```

- `<ORCA>` 按 orchestration 技能的规则解析（本机为 `$ORCA_CLI_COMMAND`）。Orca 升级后若支持跨主机派发，先运行 `<ORCA> skills get orchestration` 核对，然后改回 `worker-start --on windows`，并更新本节。
- 这种方式下 Codex 跑完后不会自动通知 Claude，需要用后台命令等待其终端脱离 `Working` 状态后再读取；任务卡要求 Codex 在最终回复中写全交付内容。
- 开工前须让 Windows 仓库与本仓库同一提交（Windows 端 `git pull --ff-only`），并在任务卡中写明预期的提交号。
- 留意 Codex 每周额度（终端底部 `weekly limit`）；额度不足时先告知用户，不擅自切换成低档模型。
- 任务卡放在 `docs/tasks/<任务编号>.md`，必须能脱离上下文独立阅读。内容至少包括：目标、背景文件、**允许修改的文件**、禁止事项、验收证据，以及非零退出码算失败还是算交付物。
- 同一时间只允许一个 Codex 任务修改同一个共享入口（`preview/app.js`、`ui-functions.js`、`template.html`、打印/导出模块、构建脚本、`package.json`）。需要并行时，在 Windows 上另建工作树隔离，由 Claude 合并。

## 3. 开发流程

1. **立项**：Claude 写出任务卡和验收标准。涉及范围、文案、价格、对外行为的任务，先请用户确认；纯缺陷修复、测试修复可直接派发，事后汇报。
2. **执行**：Codex 在指定分支开发，只改任务卡允许的文件。
3. **自测**：至少跑 `npm test` 和 `npm run check`；改到界面或渲染的，还要跑对应的浏览器测试并截图；改到打印的，要导出实际 PDF 并逐页渲染检查。失败要如实报告，不得删改测试来换取通过。
4. **交付**：Codex 在最终回复中列出改动文件、命令及其输出摘要、截图或 PDF 路径、尚未完成的事项。
5. **审核**：Claude 审 diff、复核证据，有缺口时在同一终端追加指令要求补齐。
6. **验收**：Claude 向用户汇报结果和证据，涉及视觉的附截图；经用户验收后才算完成。
7. **提交**：Codex 在当前工作分支提交，提交信息写明任务编号。推送远程、合并、发布站点都须用户另行批准。禁止 force push，禁止改 main。

## 4. 作图流程（硬性关卡）

### 4.1 作图方式

- **画风锁定**：所有新图都必须沿用 `docs/ART-STYLE.md` 定义的既有画风，附上规定的参考图和提示词固定段；不得重新设计画风。
- 所有插画素材——背景、人物身体动作、道具、动物、封面图——**必须使用 Codex 的内置图像生成/编辑能力**制作。
- **禁止用代码作图**：不得用 Canvas、SVG、PIL/numpy、程序化绘制、滤镜拼接等方式生成或补画插画内容，也不得用代码修补、重绘、“修复”画面像素。
- 代码只允许做以下事情：无损格式转换与编码（PNG→WebP 等）；按已有透明通道裁边；读取尺寸、做 ppi 和像素检查；运行时按 `AGENTS.md` 规定的人物管线合成，以及摆放已批准的素材。
- 真人头像永远不进入图像生成。测试用的人物只能是默认卡通头或公开、虚构的测试头像。

### 4.2 审图关卡

每张图片都必须经过下列步骤，**用户批准前不得进入生产**：

1. **需求单**：Claude 按故事情节写出每张图的需求，包括编号、用途（背景/动作/道具）、景别、观察方向、动作、与前后页的连续性要求、参考图和尺寸。
2. **出样**：Codex 用内置图像能力生成候选图，放到 `.local/art-review/<批次编号>/`（不进 Git），同时记录提示词、参考图和生成次数。
3. **初审**：Claude 逐张检查画风是否统一、比例是否符合母版（动作图须与 `child-v1` 母版并排对比）、透明通道、遮挡关系、情节是否正确、有无多余文字或水印。不合格的直接退回 Codex 重做，不提交给用户。
4. **终审**：Claude 把初审通过的图连同用途说明和前后页上下文提交给用户；尽量制作成对比/缩略图页面，并逐张标注编号。
5. **用户逐张批复**：通过 / 修改（附意见）/ 废弃。批复内容记入 `content/art-approvals.json`，字段包括：编号、文件哈希、批复结果、意见、日期。
6. **生产**：只有状态为“通过”的图才能复制到 `art-samples/`、登记到素材清单或动作库、接入场景、参与页面或 PDF 输出。改过的图视为新图，须重新走第 3–5 步。

“生产”包括：入库、登记动作、接入场景配置、批量出页和导出 PDF。用户批复前，任何场景代码都不得引用候选图。

### 4.3 新批次或新角色

画风不再重新确定。每个新批次或新增的固定角色，先只出 1–2 张定调样张，确认与既有画风一致、经用户批准后，再出其余图片，以免整批返工。

## 5. 进度与汇报

- 任务看板为 `docs/tasks/BOARD.md`，记录编号、状态（待确认/进行中/待审核/待用户验收/完成/阻塞）、负责方和证据路径。由 Claude 维护。
- 汇报只写可核实的结果。没有经过验证的写“待验证”；没有新产出的写“无新增完成项”。不以文件时间或历史测试结果推断当天完成了什么。
- 关于真机、实体打样、部署、支付，不得用模拟或自动化测试代替其结论。

## 6. 新会话开工清单

1. 读 `AGENTS.md`、本文件、`docs/ART-STYLE.md`、`docs/tasks/BOARD.md`；需要背景时再读 `README.md` 和 `docs/launch-plan.md`。
2. 运行 `git fetch` 和 `git status -sb`，确认所在分支及是否最新。
3. 查看 `docs/tasks/BOARD.md` 中“进行中”的任务，用 `terminal read --environment windows` 读取对应 Codex 终端，先处理这些任务的回报。
4. 向用户简要确认当前状态，再继续工作。
