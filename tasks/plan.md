# Tauri 迁移实施

用户已批准 SPEC 开发。按依赖顺序交付，具体检查见 todo.md。

1. 兼容桥、静态构建、可启动 Tauri 窗口。
2. 配置校验、原子保存和系统凭据库，独立账户窗口。
3. Rust Cursor SQLite 与 Antigravity 本机 RPC。
4. API Key 查询、Codex/Claude/Kimi 登录与刷新。
5. GLM/DeepSeek 登录协议验证及实现。
6. 桌面行为、迁移文档、平台构建与运行验证。

不改 src/renderer；账户与数据状态使用独立页面。真实模式只有有效百分比投影到旧配额环，全部状态在账户页可见。新页面不承担认证和数据计算。

风险：GLM/DeepSeek 登录尚无已验证协议；需要真实账户完成五渠道双模式验收；本机不能替代 Windows/Linux 实测。不得将这些未验证项标记完成。

## React 前端重构（2026-09-09 批准）

依赖顺序：Vite 双入口与共享桥接类型 → 主悬浮窗 React 迁移 → shadcn 设置窗 → 完整构建与 Tauri 运行验证。

- 使用 React + TypeScript 和 Vite 多页面构建，`pulse.js` 继续先于应用入口加载。
- 主悬浮窗保持现有视觉、停靠、折叠和详情交互，不把 Rust 业务搬进前端。
- 设置窗使用最小 shadcn/ui 组件集合；平台设置可独立折叠，默认仅第一项展开；不请求或展示配额数据。
- 当前两个 Tauri 窗口均为单页面，不引入 TanStack Router。

风险：透明悬浮窗的鼠标离开与原生窗口缩放存在时序依赖；用现有桥接契约测试和实际 Tauri WebView 检查约束。设置保存失败必须保留未提交输入。
