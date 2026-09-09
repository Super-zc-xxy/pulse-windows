# Pulse 跨平台 Tauri 后端迁移

状态：2026-09-08 用户已批准开发。Tauri 主体迁移已实现，GLM/DeepSeek 登录协议、真实账号及三平台完整验收尚未完成；现场证据见 docs/verification.md。后续提出的 React 前端重构见 `SPEC-frontend-react.md`，批准后覆盖本文“保持 renderer 原样”和“不增加新前端框架”两项旧约束。

## 目标与范围

将 Electron 后端迁移到 Tauri/Rust，由后端负责业务、认证、配置、数据源及桌面窗口；前端只负责显示与交互。保留现有前端视觉及交互，复用 `window.pulseAPI`。保持 renderer 原样；新增登录、Codex/Claude Key 输入及余额/未知额度展示使用独立账户页，通过托盘和原生菜单进入。以后替换 React、Vue 等前端只需调用同一接口，不必改后端业务。

不增加常驻 HTTP 代理、云端后端或新前端框架。增加供应商账户认证及本地凭据管理；OAuth 允许仅在登录期间存在的 loopback 回调服务，不部署 CLIProxyAPI 服务。

## 新增需求与证据

- Codex、Claude、Kimi、GLM、DeepSeek 全部以 API Key 和登录双模式为目标；认证能力和配额读取权限分别验证。
- 登录参考 CLIProxyAPI；其当前源码有 Codex/Claude OAuth 和 Kimi Device Authorization，没有 GLM/DeepSeek authenticator。后两者的登录仍是待完成需求，不以 Key 输入或仅打开官网替代。
- Cursor 禁止通过 Python 读取；采用 Rust 原生 SQLite 只读获取 Cursor 客户端登录态、Rust HTTP 请求账户用量的方案。
- Antigravity 参考 Pulse，发现真实语言服务进程/监听端口后查询本机 RPC，去除 Python 及固定端口猜测。
- 完整来源、commit、协议路径、三平台适配建议及验证边界见 [数据源调研](docs/provider-research.md)。本轮仅源码/文档核验，没有真实账号联调结论。

## 当前实现依据

- `src/preload/index.js` 已集中定义 7 个请求方法与 4 个事件订阅方法。
- `src/main/index.js` 管理透明置顶窗口、三边停靠、折叠、托盘、单实例和定时刷新。
- `src/main/store.js` 将配置存于 `~/.pulse-win/config.json`。
- Cursor 通过 Python 读取 SQLite 和请求 usage-summary；路径仅覆盖 Windows。
- Antigravity 通过 Python、PowerShell 发现语言服务进程和端口。
- Codex、Claude、Kimi、GLM、DeepSeek 包含写死的百分比；真实模式无数据时会回退演示数据，不能把这些值视为真实配额。
- 前端拖拽依赖 Electron 的 `-webkit-app-region`；迁移桥必须适配拖拽区域及交互元素排除规则。

## 技术选型

2026-09-08 查询官方发布页：https://v2.tauri.app/release/

- Tauri Rust runtime：2.11.5。
- `@tauri-apps/cli`：2.11.4。
- `tauri-build`：2.6.3。
- Rust stable，保留 pnpm 管理构建工具；应用运行不依赖系统 Node、Python。
- 实施安装时再次核实官方稳定版本，提交 Cargo.lock 与 pnpm-lock.yaml，避免预发布版本及不可复现构建。

## 目录与依赖方向

```text
src/renderer/                 现有前端，保持原样
src/bridge/                   pulseAPI 兼容桥，由桌面壳在页面脚本前注入
src-tauri/src/lib.rs          Tauri 生命周期、命令及事件接线
src-tauri/src/desktop.rs      窗口、屏幕坐标、拖拽停靠和托盘
src-tauri/src/config.rs       配置校验、持久化与旧配置导入
src-tauri/src/auth/           登录任务、API Key、凭据存储与刷新
src-tauri/src/providers/      配额读取、规范化、缓存及故障隔离
src-tauri/tauri.conf.json     三平台桌面与打包配置
src-tauri/capabilities/       最小必要权限
tests/                       JS 桥契约自检
```

依赖方向：显示层 → 兼容桥 → Tauri commands → 配置/认证/数据源。认证向数据源提供凭据；数据源不依赖窗口和 DOM；桌面操作独立于额度业务。按实际复杂度组织文件，不预建服务框架或单实现工厂。

## 接口与代码风格

保持现有前端方法名、Promise 行为、JSON camelCase 字段和事件载荷：

| 方法 | 后端职责 |
| --- | --- |
| getMetrics | 返回已启用数据源的规范化指标列表 |
| getConfig | 返回兼容现有设置表单的配置 |
| saveConfig | 校验并持久化配置，发送配置/指标更新 |
| setExpanded | 更新窗口展开状态及边缘位置 |
| setWindowHeight | 校验尺寸、保持长边长度及屏幕边界 |
| openSettings | 唤醒窗口，发送 open-settings-modal |
| quitApp | 退出桌面进程 |

保留 `metrics-update`、`config-update`、`toggle-settings`、`open-settings-modal`；订阅方法立即返回取消函数，处理异步监听注册与取消的竞态。

新增 `getProviderCapabilities`、`getAuthStatus`、`saveApiKey`、`startLogin`、`cancelLogin`、`logout` 及认证状态事件。每个登录任务有独立 attempt ID、过期时间及取消路径。配置事件不携带 Key 或 token；账户状态和配额状态分离。新指标区分 quota/balance/unavailable，兼容旧 getMetrics 时不编造比例。

Rust 使用 snake_case，JSON 使用 `#[serde(rename_all = "camelCase")]`，边界错误返回 `Result`。例如：

```rust
#[tauri::command]
fn set_expanded(expanded: bool, state: tauri::State<AppState>) -> Result<(), String> {
    state.desktop.set_expanded(expanded)
}
```

配置只接受已定义字段和值；保存失败不报告成功、不覆盖原配置。旧配置首次导入后保留原文件；新凭据使用系统凭据库或加密存储，配置仅存引用，密钥不进入日志、配置和指标事件。旧设置保存空 Key 不视为删除已存密钥，删除必须显式执行。兼容桥不向页面开放任意文件读取、命令执行能力。

## 行为要求

1. 保留透明无边框、置顶、折叠悬停、左/右/顶部停靠、偏好设置、托盘和单实例唤醒。
2. 屏幕坐标处理缩放、工作区和显示器变更；窗口不能因旧偏移移到屏幕外。前端拖拽区映射在桥接层完成。
3. 后端负责定时刷新，遵循 refreshIntervalSec，防止重复并发刷新及单数据源失败阻塞全部结果。
4. Cursor 使用三平台目录、Rust SQLite 原地只读并处理 WAL/TEXT/BLOB；Cookie 请求禁用重定向。Antigravity 遍历多个真实候选进程和端口、设总超时，专用 loopback HTTP 客户端限制证书例外范围，凭据不写入源码目录。
5. 演示模式继续提供演示指标；真实模式不回退演示、不根据凭据存在编造额度或宣称连接成功。未知额度和纯余额分别建模；旧配额环只接收有效比例。最终必须有可见的认证/不可用/余额状态，入口方式见前端约束。已有本地统计不能伪装成额度。
6. macOS、Windows、Linux 各自构建安装包。Linux 的托盘、全局定位和置顶行为需在实际桌面环境核实；记录 X11/Wayland 的实测支持边界，不承诺所有合成器行为完全相同。
7. 替换 Electron 启动/打包依赖及旧脚本，更新 README 的三平台依赖、开发、安装与迁移说明。开机启动脚本替换需保持用户主动启用，不在迁移或首次启动时自动注册。
8. 五渠道双模式分别验证：Codex/Claude API Key 账单权限与订阅额度分开；Kimi Code 与 Moonshot 分开；GLM 国内/国际站及 Coding Plan/通用 API 分开；DeepSeek 余额不编造分母。GLM/DeepSeek 登录协议未验证前不能将其标记为完成或从验收中删除。

## 命令与验证策略

以下是迁移后需提供并执行的命令，当前 Electron 项目尚不具备这些命令：

```sh
pnpm install --frozen-lockfile
pnpm dev
node --test tests/bridge.test.cjs
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked -- -D warnings
pnpm build
git diff --exit-code -- src/renderer
```

- 用隔离临时目录测试配置导入、无效输入和保存失败，禁止测试读取或修改真实用户密钥。
- 用固定响应测试数据源解析、缺失字段、错误模式和额度边界，不依赖真实账号网络请求。
- 认证检查覆盖 PKCE/state、取消、端口占用、设备码过期、刷新轮换及凭据不泄露；新增 Cursor SQLite 和 Antigravity 多候选夹具。每个渠道双模式的真实账号验收与自动化夹具检查分开记录。
- 桥接自检覆盖所有现有方法、事件载荷、取消监听及注入顺序。
- 在 macOS 实际运行桌面窗口，核实托盘、折叠、拖拽、设置保存和二次启动。
- Windows/Linux 用对应系统构建验证，记录运行验证是否完成；只生成 CI 配置不能算三平台验证通过。

## 边界及验收

- 始终：前端不承担认证/额度业务，renderer 变更仅在用户确认范围内；业务在 Rust；保存现有配置；失败可诊断；提交可复现依赖锁；完成对应检查。
- 先确认：前端源码变更、额外远程服务、删除用户配置、发布安装包或使用签名凭据。
- 禁止：静默演示回退、泄露凭据、以本机编译代替三平台验收、将未经运行验证的功能报告为通过。
- 完成条件：Electron 已从运行链移除，前端通过兼容桥工作，桌面及数据源迁移完成，五渠道双模式全部逐项验收，验证证据与平台限制写入 README/交付说明。

## 后续执行顺序

认证/数据源调研与未决协议验证 → 规格审阅 → 迁移计划与验收任务 → 兼容桥和可启动桌面 → 配置/认证/数据源 → 托盘及停靠完整行为 → 移除旧运行链 → 各模式及平台运行验收。
