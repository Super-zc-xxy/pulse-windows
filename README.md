# Pulse Desktop

AI 编程额度屏幕边缘监视器。桌面壳、配置、认证和数据查询使用 Tauri 2.11.5 / Rust；原有 `src/renderer` HTML/CSS/JS 保持不变，通过 `window.pulseAPI` 连接后端。

**当前为迁移开发版，尚未达到 SPEC 全部验收条件。** GLM / DeepSeek 登录尚未实现；已接入的认证和数据源尚未进行真实账号验收。Windows/Linux 尚未运行验证。

## 开发与构建

需要 Rust stable、Node.js 24、pnpm 11.20.0，以及 [Tauri 平台依赖](https://v2.tauri.app/start/prerequisites/)：macOS 安装 Xcode Command Line Tools；Windows 安装 MSVC C++ Build Tools 和 WebView2；Linux 安装 WebKitGTK 4.1、编译工具、AppIndicator 和 Secret Service/DBus 开发包。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

```sh
pnpm test
pnpm build:frontend
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked -- -D warnings
pnpm build
```

Apple Silicon 上若 Node 在 Rosetta 中运行、Rust 为原生 arm64，请明确指定目标，避免 CLI 按 Node 架构标错包名：

```sh
pnpm exec tauri build --target aarch64-apple-darwin --no-sign
```

构建产物位于 `src-tauri/target/release/bundle/`；显式指定目标时位于 `src-tauri/target/<target>/release/bundle/`。`.github/workflows/desktop.yml` 在 PR 和 `main` 推送时只运行三平台质量检查，不生成安装包；只有推送合法的 tag（如稳定版 `v1.0.0` 或 Beta 版 `v1.1.0-beta.1`）才会使用 tag 版本创建 GitHub Release，发布 macOS Apple Silicon/Intel、Windows x64 和 Ubuntu x64 安装包。带预发布后缀的 tag 会自动标记为 GitHub Prerelease。

macOS CI 产物使用 ad-hoc 签名，但未使用 Apple Developer 证书及公证；Windows 产物也未做 Authenticode 签名。正式对外分发前仍需配置对应平台的签名凭据。

运行安装后的应用不需要 Node/Python。开发脚本只复制静态页面并插入兼容桥，不引入前端框架。修改前端文件后重新运行 `pnpm dev`。

## 使用与账户

监控栏齿轮打开原有偏好设置；托盘的“账户与数据状态”打开独立账户窗口，配置 Key、启动/取消登录、清除凭据并查看余额或查询失败原因。新安装默认真实数据模式；需要预览界面时可在偏好设置主动启用演示模式。

| 渠道 | 已实现路径 | 验证边界 |
| --- | --- | --- |
| Codex | API Key 模型接口验证；浏览器 PKCE 登录、刷新；订阅 usage | 普通 API Key 不代表能读组织账单/订阅配额，界面会明确说明；未做真实登录验收 |
| Claude | API Key 模型接口验证；浏览器 PKCE 登录、刷新；OAuth usage | 与组织 Admin API 分开；未做真实登录验收 |
| Kimi Code | API Key / 设备码登录、刷新；coding usages | 不混用 Moonshot 通用 Key；未做真实账号验收 |
| GLM | BigModel 国内站 / Z.ai 国际站 Coding Plan Key 查询 | **登录协议未验证，登录入口禁用** |
| DeepSeek | API Key 余额查询，保留币种和金额 | **登录未实现**；余额没有虚构的百分比分母 |
| Cursor | Rust SQLite 只读客户端会话；HTTPS usage-summary | 支持 TEXT/UTF-16LE、原地 WAL、过期检查、禁止重定向；内部接口尚未账号联调 |
| Antigravity | 当前用户的语言服务进程/实际监听端口；本机 RPC | macOS ps/lsof、Linux /proc、Windows PowerShell 系统接口；三平台尚未真实 IDE 联调 |

Cursor 支持默认系统目录，也可在账户页指定用户数据根目录；其下固定读取 `User/globalStorage/state.vscdb`。不读取浏览器 Cookie 库。Antigravity 必须已启动并登录，遍历候选进程/端口，限制总时间预算；不猜固定端口、不保存 CSRF token。

旧配额环只展示有明确百分比的窗口。余额、未登录、无权限、接口不兼容等完整状态在账户页显示；真实模式不会回退演示数据，也不会把“存在凭据”当作连接成功。

## 配置与迁移

配置使用系统应用配置目录中的 `com.pulse.desktop/config.json`（具体路径由 Tauri 平台路径 API 决定）。API Key 和 OAuth access/refresh token 存入系统凭据库，服务名 `com.pulse.desktop`；Linux 需要可用且已解锁的 Secret Service。配置和事件不返回原始凭据。

首次启动导入 `~/.pulse-win/config.json`，原文件保留。导入失败不覆盖旧文件；旧文件可能仍含明文 Key，请在确认迁移成功后自行处理。新配置写入经过校验及临时文件原子替换；保存空 Key 不会删除已保存凭据，“清除凭据”才会删除。

Electron、旧 Python 采集器及会终止所有 Electron 程序的旧脚本已经从运行链移除。以前自行创建的 `Pulse.lnk`/开机启动项不会被自动删除，需手动移除或改为新的安装程序路径。

可选开机启动由用户在操作系统中启用：macOS 的“登录项”、Windows 的 `shell:startup` 应用快捷方式、Linux 的桌面环境“启动应用程序”。应用首次运行不会自动注册。

## 接口与结构

- `src/renderer`：保留的监控界面。
- `src/bridge/pulse.js`：Promise 命令与事件订阅适配；立即返回取消函数，处理异步注册竞态。
- `src/accounts`：账户和数据状态展示，不执行认证协议或网络查询。
- `src-tauri/src/config.rs`：配置模型、校验与保存。
- `src-tauri/src/auth`：PKCE/设备码、登录尝试、取消/超时、令牌刷新；`auth.rs` 管理系统凭据。
- `src-tauri/src/providers`：Cursor/Antigravity 原生适配；`providers.rs` 规范化所有渠道指标。
- `src-tauri/src/desktop.rs`：窗口、停靠和托盘；`lib.rs` 注册命令并调度刷新。

后端业务不依赖 DOM。React/Vue 等前端只需使用同一命令契约；无需改认证及数据源代码。完整规格见 [SPEC.md](SPEC.md)，数据来源与内部接口限制见 [调研报告](docs/provider-research.md)。

## 隔离桌面检查

仅 debug 构建支持 `PULSE_TEST_CONFIG`。启用后强制演示数据，并阻断所有真实供应商读取、HTTP 客户端、登录及系统凭据读写。

```sh
PULSE_TEST_CONFIG=/tmp/pulse-smoke/config.json cargo test --manifest-path src-tauri/Cargo.toml --locked smoke_profile_blocks_credentials_and_network -- --ignored
PULSE_TEST_CONFIG=/tmp/pulse-smoke/config.json pnpm dev
```

隔离检查不能替代真实账号测试。当前检查记录见 [verification.md](docs/verification.md)。Linux 托盘、全局坐标和置顶行为依赖桌面环境，特别是 Wayland，尚未实测支持边界。
