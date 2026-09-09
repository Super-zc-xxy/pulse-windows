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
