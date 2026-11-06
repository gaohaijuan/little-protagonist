# 任务看板

状态：待确认 / 进行中 / 待审核 / 待用户验收 / 完成 / 阻塞。负责方：用户、Claude、Codex。

| 编号 | 任务 | 状态 | 负责 | 证据 |
| --- | --- | --- | --- | --- |
| T000 | 确认 `docs/WORKFLOW.md` 开发流程与 `docs/ART-STYLE.md` 画风锁定 | 完成 | 用户 | 2026-11-06 用户确认 |
| T001 | 试派发：验证 Windows Codex 能通过 Orca 接收任务、访问本仓库并回报（只读，跑 `npm run check`、`npm test`） | 阻塞 | Claude→Codex | 2026-11-06 首次派发失败：Orca 仅有本机 Linux 主机（workstation-252），其 Codex 未登录（停在登录选择页）；未连接 Windows 主机 |
| T002 | 修复 `tests/layered-art.test.cjs:36` 的 `Invalid pose body` 回归（10月28日起持续失败），完整回归通过 | 待派发 | Codex | — |
| T003 | 同步 `docs/browser-trial.md` 中过时的117/118页、401项通过等记录，使之与当前132页版本一致 | 待派发 | Codex | — |

## 待用户决定

- 第三级 `level3-fourth-book` 的素材（如 `garden-wide.png`）偏离锁定画风，是否按 `docs/ART-STYLE.md` 重做？在用户决定前，不以它作参考，也不扩展。
