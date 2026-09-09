# 实施与验收

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
