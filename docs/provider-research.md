# 认证与额度数据源调研

调研日期：2026-09-08。结论来自公开源码和官方文档，未登录用户账号，未读取本机凭据，未实测远端认证/配额接口。

## 源码基线

| 项目 | 本次读取的 commit | 用途 |
| --- | --- | --- |
| router-for-me/CLIProxyAPI | `d198db54d4c4886c99b21488d54fc576933019a3` | OAuth、设备码、刷新流程 |
| qunqin24/Pulse | `7a9480ddf05fe725fa237cc36d6b8c1013591b5b` | Cursor、Antigravity、订阅额度 |
| MoonshotAI/kimi-cli | `86f136422a0aae6b217ea49e7ea1d2e8a1defcd2` | 官方 Kimi 认证与 usages 调用 |
| zai-org/zai-coding-plugins | `0446d0bb0bc537d97d3ab3664c4b8b9c4a0e1254` | 官方 GLM Coding Plan 用量请求 |

## 选型结论

Tauri/Rust 自己实现认证及用量读取，不打包 CLIProxyAPI Go 代理服务，不运行 Python。参考其协议和状态管理即可；本项目没有模型请求转发需求。推荐 `reqwest` 处理 HTTP、`rusqlite` 只读访问 Cursor SQLite，进程发现只在 Antigravity 平台适配内实现。

登录凭据和额度指标分离：登录成功不等于有余额查询权限，API 调用统计不等于订阅剩余额度。五个指定渠道的 API Key/登录双模式是验收目标；下表中的待验证项仍是未完成需求，不会降级成“打开官网即登录成功”。

## 五个渠道的双模式

| 渠道 | API Key 方案 | 登录方案 | 当前证据/缺口 |
| --- | --- | --- | --- |
| Codex | 保存 OpenAI API Key，区分项目 Key 与账单管理凭据 | 参考 CLIProxyAPI 的 OAuth Authorization Code + PKCE；设备码为候选备用 | 登录代码已核实；订阅额度与 API 账单必须分开；普通 Key 不足以读取组织 Usage API |
| Claude | 保存 Anthropic API Key，组织用量需 Admin API 凭据 | 参考 CLIProxyAPI 的 OAuth + PKCE | 登录与刷新源码已核实；Pulse 使用内部 OAuth usage 路径，尚未实测 |
| Kimi | Kimi Code Key 查询 coding usages；Moonshot 通用 API Key 不能混用为 Coding Plan Key | OAuth Device Authorization，浏览器确认，后端轮询和刷新 | 官方 kimi-cli 用同一用量读取函数接收 API Key 或 OAuth 解析后的凭据，双模式证据完整，待账号实测 |
| GLM | 按 BigModel 国内站/Z.ai 国际站选择官方 monitor API | 继续验证官方 ZCode 的账户连接流程 | CLIProxyAPI 无 GLM authenticator；官方 ZCode 有账户模式，但本次未获得可直接移植的完整登录协议，不能承诺通用 OAuth |
| DeepSeek | 官方 `GET https://api.deepseek.com/user/balance`，Bearer API Key | 继续验证开放平台网页登录会话及余额读取 | CLIProxyAPI 无 DeepSeek authenticator；官方 API 文档仅明确 API Key；没有找到可直接采用的第三方 OAuth 方案 |

### Codex / Claude

- CLIProxyAPI 的 Codex 授权端点是 `auth.openai.com/oauth/authorize`、token 端点是 `/oauth/token`；当前回调为 `http://localhost:1455/auth/callback`。
- Claude 源码使用 `claude.ai/oauth/authorize`、`platform.claude.com/v1/oauth/token`，回调为 `http://localhost:54545/callback`。不能把旧博客的端点、scope 或随机回调端口当作有效协议。
- Rust 登录尝试绑定 provider、随机 state、PKCE verifier 和截止时间；回调 state 必须与本地保存值严格一致。端口占用要报告，取消/超时释放监听器。刷新按账户去重并原子保存新 refresh token。
- Pulse 的 Codex 请求 `chatgpt.com/backend-api/wham/usage`；也有已安装 Codex app-server 的 `account/rateLimits/read` 路径。独立登录优先评估直接 HTTP，app-server 属于可选集成，不能新增必装 CLI 的运行要求。
- Pulse 的 Claude 请求 `api.anthropic.com/api/oauth/usage`。这些消费端内部接口不等于公开稳定 API；认证 scope、有效响应和失败处理需要实际验证。
- 官方 OpenAI 组织用量接口需要管理权限；Anthropic Usage and Cost API 同样与普通模型 Key、Claude 订阅分开。API Key 模式须支持明确的“无账单读取权限”，不能生成一个假配额环。

来源：[Codex 登录源码](https://github.com/router-for-me/CLIProxyAPI/blob/d198db54d4c4886c99b21488d54fc576933019a3/internal/auth/codex/openai_auth.go)、[Claude 登录源码](https://github.com/router-for-me/CLIProxyAPI/blob/d198db54d4c4886c99b21488d54fc576933019a3/internal/auth/claude/anthropic_auth.go)、[Pulse Codex](https://github.com/qunqin24/Pulse/blob/7a9480ddf05fe725fa237cc36d6b8c1013591b5b/Sources/Pulse/CodexUsageService.swift)、[Pulse Claude](https://github.com/qunqin24/Pulse/blob/7a9480ddf05fe725fa237cc36d6b8c1013591b5b/Sources/Pulse/ClaudeCodeUsageService.swift)、[OpenAI 官方 CLI 管理用量命令](https://github.com/openai/openai-cli/blob/main/README.md)、[Anthropic Usage and Cost API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api)。

### Kimi

认证走 `auth.kimi.com/api/oauth/device_authorization` 与 `/api/oauth/token`；遵循服务返回的轮询间隔，区分 pending、slow_down、拒绝、过期及取消。用量为 Kimi Code 的 `/usages`，现有 Pulse 指向 `https://api.kimi.com/coding/v1/usages`。官方 CLI 通过 `resolve_api_key(provider.api_key, provider.oauth)` 取得认证值，再以 Bearer 请求用量，证明不能将“登录支持”仅归因于第三方项目的描述。

用量包含 `usage` 与 `limits[]`，按响应的时间窗口、used/limit/remaining 解析；不要硬编码所有账户都有相同配额。读取 Python 官方源码只是协议调研，交付实现仍为 Rust。

来源：[CLIProxyAPI Kimi](https://github.com/router-for-me/CLIProxyAPI/blob/d198db54d4c4886c99b21488d54fc576933019a3/internal/auth/kimi/kimi.go)、[官方 CLI usage](https://github.com/MoonshotAI/kimi-cli/blob/86f136422a0aae6b217ea49e7ea1d2e8a1defcd2/src/kimi_cli/ui/shell/usage.py)、[官方 CLI OAuth](https://github.com/MoonshotAI/kimi-cli/blob/86f136422a0aae6b217ea49e7ea1d2e8a1defcd2/src/kimi_cli/auth/oauth.py)。

### GLM / DeepSeek 的待验证边界

GLM 官方插件已经提供可核验的 API Key 查询路径：`/api/monitor/usage/quota/limit`，以及 `model-usage`、`tool-usage`。国内站使用 `open.bigmodel.cn`，国际站使用 `api.z.ai`。本次源码把 token 原样放入 `Authorization`，实现时应依据凭据类型验证格式，不能一律加 Bearer。域名用精确 allowlist，不照搬脚本的字符串 includes 判定。

官方 ZCode 文档明确区分账户连接和 API Key、Coding Plan 和普通预付费额度。这说明 GLM 登录方向值得继续验证，但不证明任意第三方应用可以照搬客户端 ID。后续需定位官方客户端的授权、回调/轮询、刷新、退出及查询协议，分别验证国内/国际账号。

DeepSeek 已验证的余额响应是金额和币种，不提供用于“余额百分比”的固定总额。登录目标应绑定开放平台账号，不能把聊天站会话自动视为开放平台 API 余额凭据。若只能采用网页登录，先做独立会话容器、登录完成判定、余额权限、过期/退出的验证；不得在监控页面注入官网脚本或采集账号密码。未完成这些验证前登录模式保持待实现，不用手工粘贴 Key 冒充登录。

来源：[官方 GLM 插件文档](https://docs.z.ai/devpack/extension/usage-query-plugin)、[实际请求代码](https://github.com/zai-org/zai-coding-plugins/blob/0446d0bb0bc537d97d3ab3664c4b8b9c4a0e1254/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs)、[ZCode 连接说明](https://zcode.z.ai/en/docs/configuration)、[DeepSeek 余额 API](https://api-docs.deepseek.com/api/get-user-balance/)、[DeepSeek 认证文档](https://api-docs.deepseek.com/api/deepseek-api/)。

## Cursor：原生 SQLite 只读 + HTTPS

推荐默认复用 Cursor 客户端自身登录态。Rust 使用 `rusqlite` 只读打开 `User/globalStorage/state.vscdb`，查询 `ItemTable` 的 `cursorAuth/accessToken`，不启动 Python、不调用 sqlite3 CLI、不访问浏览器 Cookie 库。

候选根目录（须三平台实测，支持用户显式选择非默认安装的数据目录）：

| 系统 | Cursor 用户数据根目录 |
| --- | --- |
| macOS | `~/Library/Application Support/Cursor`，上游已实现 |
| Windows | `%APPDATA%/Cursor`，本仓库旧版已使用 |
| Linux | `$XDG_CONFIG_HOME/Cursor`，未设置时 `~/.config/Cursor`，待平台验证 |

原地只读兼容 WAL，不只复制主数据库造成新登录态丢失；处理数据库忙、缺表、缺行、TEXT/UTF-16LE BLOB。解析 JWT 的 sub/exp 只用于构造请求及本地过期预判，不当作签名验证或登录成功证明。

由账号 ID 与 token 构造 `WorkosCursorSessionToken` Cookie，请求 `https://cursor.com/api/usage-summary`。关闭重定向和 Cookie 持久化，401/403 提示重新打开 Cursor 登录；429 退避；未知字段或空额度不能默认 60%/100%。解析个人 plan、团队 pooled、on-demand，并区分金额分单位和百分比。

上游还实现了浏览器 `loginDeepControl` + `api2.cursor.sh/auth/poll`。这是私有 challenge/poll 协议，不是标准第三方 OAuth；其中 `redirectTarget=sand` 服务于上游 Grok Bot 场景，不应直接复制到本项目。可作以后独立登录的候选，本轮 Cursor 的默认路径仍为客户端只读登录态。

官方团队 Admin API 是另一条可维护路径，但需要管理员权限、数据语义偏团队，不能替代普通个人用户的账户配额监控。

来源：[原生 SQLite 登录读取](https://github.com/qunqin24/Pulse/blob/7a9480ddf05fe725fa237cc36d6b8c1013591b5b/Sources/Pulse/CursorAppLogin.swift)、[配额请求及解析](https://github.com/qunqin24/Pulse/blob/7a9480ddf05fe725fa237cc36d6b8c1013591b5b/Sources/Pulse/CursorUsageService.swift)、[浏览器登录候选](https://github.com/qunqin24/Pulse/blob/7a9480ddf05fe725fa237cc36d6b8c1013591b5b/Sources/Pulse/CursorWebLogin.swift)、[Cursor 官方 Admin API](https://docs.cursor.com/en/account/teams/admin-api)。

## Antigravity：发现真实进程、端口和本机 RPC

采用 Pulse 的本机语言服务路线：找同用户的 Antigravity language_server 进程，从启动参数获取 `--csrf_token`，枚举这些 PID 实际监听的 TCP 端口，向 `https://127.0.0.1:<port>/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary` 发送带 `x-codeium-csrf-token` 的 JSON POST。`GetUserStatus` 可补充套餐名，失败不应使已取得配额作废。

上游实际使用 macOS `ps` + `lsof`；跨平台实现建议将进程元数据和端口枚举隔离在 Rust 平台模块，macOS 可先使用有超时的系统命令，Windows 评估系统进程信息/IP Helper 端口表，Linux 评估 `/proc` 同用户进程与 socket inode 映射。具体 crate/API 在实现前以编译和平台夹具验证，不能声称上游已提供三平台实现。

必须遍历多个候选：第一个进程或端口可能返回 401、空分组或不兼容响应。设总时间预算和候选上限，避免候选数乘单请求超时使刷新长时间挂起。缓存绑定 PID、启动时间、端口和 token；进程重启立即失效，不往源码目录保存 CSRF token，不猜固定端口、不扫描无关进程。

本机自签名证书的例外仅限已发现端口的字面量 loopback 地址；使用专用客户端、禁用代理和重定向，公共 HTTPS 客户端正常验证证书。额度按所有响应分组和窗口解析，`remainingFraction` 为剩余比例；缺失字段不是 100%，套餐月度总 allowance 不是当前余额。IDE 未运行、运行但未响应、无额度、响应不兼容需要可区分状态。

CLIProxyAPI 另有 Antigravity OAuth；最初实现只采用了本机 RPC 数据源，因此账户页没有独立登录入口。该限制已在 2026-09-09 的修复中解除，下面记录新增路径。

来源：[Antigravity 服务实现](https://github.com/qunqin24/Pulse/blob/7a9480ddf05fe725fa237cc36d6b8c1013591b5b/Sources/Pulse/AntigravityUsageService.swift)。

## 需要调整的契约和验收

- 新增认证方法：`getProviderCapabilities`、`getAuthStatus`、`saveApiKey`、`startLogin`、`cancelLogin`、`logout`；登录任务用 attempt ID，事件只传状态/提示，不传 token。
- 持久化配置只留认证模式和凭据引用。API Key、access/refresh token 进入系统凭据库或加密存储，前端只接收 configured/masked/status；旧设置保存空 Key 不代表删除，显式删除另行处理。
- 新指标区分 `quota`、`balance`、`unavailable`，包含来源、采集时间和 live/stale；旧 getMetrics 可保留兼容投影，但不能把未知值映射为 0%/100%。
- 原前端没有 Codex/Claude Key 输入、登录/退出入口，也不能显示未知额度或纯余额。因此“前端逐字不改”与完整双模式交付存在冲突。优先只扩展设置和缺失数据展示，保持现有视觉及交互；用户未确认前不改 renderer。若坚持不改，需评估托盘/独立认证窗口，并明确旧配额环只能显示有效比例。
- 验证：认证 state 错配、拒绝、取消、超时、刷新轮换；SQLite WAL/TEXT/BLOB/忙；不同 Cursor 套餐；Antigravity 第二候选成功、PID 重用、端口变化；无权限、429、坏 JSON 和缺失额度。全部使用脱敏夹具，不拿用户真实凭据做自动化测试。
- 五渠道双模式必须逐一完成真实账号认证/退出/过期及指标语义验收。GLM/DeepSeek 登录未通过验证时不得标记整项交付完成。

参考代码若实际移植，保留 CLIProxyAPI 的 MIT 通知和 Pulse 的 Apache-2.0 相关归属；当前仅研究及规格变更。

## 开发期间追加核验

2026-09-08 读取 ZCode 官方登录页实际引用的 [6198 共享脚本](https://zcode.z.ai/_next/static/chunks/6198-95b6b1b1fef80b7e.js) 与 [301 配置脚本](https://zcode.z.ai/_next/static/chunks/301-e9261fe78647d281.js)：存在 Z.ai / BigModel 授权、nonce state、ZCode `/api/v1/oauth/token` 交换及 ZCode JWT。网页回调约束绑定本站 origin，未证明 Pulse 可注册独立 callback；不能直接复制官方客户端 ID 后宣称完成第三方登录。DeepSeek 官方网页源码请求返回 HTTP 429，未取得可验证的平台登录协议。两项继续保留为未完成要求。

### Codex 配额补全（2026-09-09）

对照 CLIProxyAPI 的 `internal/runtime/executor/helps/codex_quota.go`（本地研究提交 `d198db54d4c4886c99b21488d54fc576933019a3`，并核对远端源码）和 Pulse 的 `CodexUsageService.swift`（`7a9480ddf05fe725fa237cc36d6b8c1013591b5b`）：
- `/wham/usage` 的 `primary_window` 不保证是 5 小时窗口，窗口名称从 `limit_window_seconds` 推导。
- 读取 HTTP 数组形式的 `additional_rate_limits[].rate_limit`，以及代码审查窗口；保留套餐、积分余额、限额状态。
- 保留数字 `reset_at`，缺少时可用 `reset_after_seconds` 加采集时刻；展示层负责格式化。
- 请求携带当前访问令牌中的 `chatgpt_account_id` 路由头；该字段仅用于账号路由，不作为本地鉴权依据。令牌仍只交给既定 ChatGPT API。
- 积分余额不是美元费用，不再标成“估算开销”；接口没有提供的数据明确显示“未提供”。

来源：https://github.com/router-for-me/CLIProxyAPI/blob/main/internal/runtime/executor/helps/codex_quota.go 、 https://github.com/qunqin24/Pulse/blob/main/Sources/Pulse/CodexUsageService.swift

### Antigravity 独立登录与远程配额（2026-09-09）

对照 CLIProxyAPI 当前 `internal/auth/antigravity` 与 `sdk/auth/antigravity.go`：

- 使用 Google OAuth authorization code 流程，请求 offline access 并验证随机 `state`；回调仅监听 loopback。Pulse 使用系统分配的空闲端口，避免 Windows 固定 51121 端口落入保留区间。
- token 交换后调用 `v1internal:loadCodeAssist` 获取 `cloudaicompanionProject`；新账户未完成初始化时按服务返回的默认 tier 调用 `onboardUser`。
- access token、refresh token 与 project ID 只保存到系统凭据库，前端只接收 configured/mode 状态。
- 配额优先向 `daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` 发送 `{"project":"..."}`，再尝试生产 host；两者失败时回退到原有本机 language server RPC。
- 解析根级或 `response.groups` 的全部 group/bucket，严格使用服务返回的 `remainingFraction` 和 `resetTime`，缺失比例不会被当作满额。

来源：[CLIProxyAPI Antigravity 常量](https://github.com/router-for-me/CLIProxyAPI/blob/main/internal/auth/antigravity/constants.go)、[认证与项目发现](https://github.com/router-for-me/CLIProxyAPI/blob/main/internal/auth/antigravity/auth.go)、[浏览器回调流程](https://github.com/router-for-me/CLIProxyAPI/blob/main/sdk/auth/antigravity.go)。
