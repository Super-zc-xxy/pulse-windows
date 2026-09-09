# 实施与验收

- [x] 修复 Windows CI 中测试直接依赖 `corepack` 的问题，并启用提交前测试 hook。

- [x] 兼容桥与 Tauri 启动：七个旧命令、事件取消竞态、renderer 无改动；node --test tests/bridge.test.cjs 和 cargo check。
- [x] 配置与账户窗口（依赖启动）：验证非法配置、保存失败保留旧值、凭据不回传；cargo test。
- [x] Cursor 原生实现及夹具检查（依赖配置）：三平台 SQLite 路径、TEXT/BLOB/WAL、会话过期、禁止重定向；解析及 SQLite 临时库测试。
- [ ] Antigravity（依赖启动）：发现全部真实候选、隔离本机证书策略、总超时；多候选及响应解析测试。
- [ ] Key 用量（依赖账户）：Kimi/GLM/DeepSeek 真实字段，Codex/Claude 管理权限独立；固定响应测试。
- [ ] Codex/Claude/Kimi 登录（依赖账户）：PKCE/state、设备码、取消/过期/刷新；认证测试及真实账号验收。
- [ ] GLM/DeepSeek 登录（依赖协议证据）：完成可复现登录协议及真实账号验收，不能以打开网站代替。
- [ ] 桌面行为（依赖启动）：托盘、停靠、缩放、折叠、单实例；macOS 运行检查。
- [ ] 发布准备（依赖以上）：Electron/Python 退出运行链、锁文件、README、三平台构建；fmt/test/clippy/build。
- [ ] 最终验收：Windows/Linux 运行、五渠道双模式真实账号验证；记录所有未验证边界。

## 本轮检查结论

- 已移除 Electron/Python 运行链，提供独立账户页、五渠道 Key 输入及 Codex/Claude/Kimi 登录实现。
- macOS debug .app 构建通过；隔离模式下设置保存、顶部停靠、账户菜单、二次启动唤醒及登录阻断已实际检查。
- 未勾选条目仍有真实账号、平台或协议验收缺口；详见 docs/verification.md。未将首次源码实现等同最终验收。

- macOS arm64 release .app / DMG 已构建，未签名、公证或发布；Windows/Linux 仍待验证。

## React 前端重构

- [x] Vite/React 双入口基础：TypeScript、ESM、桥接类型与构建产物；验证 `pnpm typecheck`、`pnpm build:frontend`。
- [x] 主悬浮窗迁移：保持三向停靠、折叠、指标推送、详情定位和设置入口；验证前端契约测试与 Tauri 主窗。
- [x] shadcn 设置窗：通用设置和平台设置全部使用组件，默认仅展开第一平台，不展示额度数据；验证保存成功/失败、认证操作和键盘交互。
- [ ] 前端完成检查：`pnpm test`、`pnpm typecheck`、`pnpm build:frontend`、`pnpm build`，记录实际窗口证据。
  - 前三项、release `--no-bundle`、debug `.app` 和实际隔离窗口已通过；默认 `pnpm build` 仍在已知的 x64 DMG 封装脚本失败，明确 arm64 CI 构建受本机 x64 Node / arm64 Rust 下嵌套 pnpm 版本检查阻断。

## 登录与侧边栏补充

- [x] 按上游 Pulse 修正 Codex 设备码和 Claude Code 动态 loopback 登录；验证协议单测与取消路径。
- [x] 侧边栏按 enabled 展示，缺少鉴权时提供定向“去配置”；验证 Node 契约、typecheck、前端构建和隔离 Tauri 窗口。

## 设置自动保存

- [x] 移除页面级保存按钮，设置变更即时持久化且不全量重载；失败保留输入并显示错误。
