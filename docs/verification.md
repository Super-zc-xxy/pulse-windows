# 迁移验证记录

日期：2026-09-08。以下是开发现场记录，不代表 SPEC 已全部完成。

## 2026-09-09 Windows 测试启动与提交前检查

- 根因：`tests/bridge.test.cjs` 在测试进程内直接启动 `corepack`，但 Windows CI 只全局安装了 `pnpm`，Node 24 环境没有可解析的 `corepack.exe`，因此 Vite 尚未运行就报 `spawnSync corepack ENOENT`。
- 修复：测试改用当前 `process.execPath` 启动项目本地的 Vite CLI，不再依赖全局 `corepack`；依赖安装通过 `prepare` 启用 `.githooks/pre-commit`，提交前通过 npm 运行完整 `test` 脚本。
- 验证：实际执行 pre-commit hook，12/12 测试通过；`npm run typecheck`、`npm run build:frontend` 和 `git diff --check` 通过。

## 2026-09-09 React 前端重构

- 主悬浮窗与设置窗已迁移到 React + TypeScript，由 Vite 8 多页面构建；`pulse.js` 在构建产物中先于 React 模块执行。
- 设置窗通用控件和平台设置使用项目内 shadcn/ui 源码组件。平台使用可多项展开的 Accordion，首次只展开第一项。
- 设置窗不再请求 `getProviderStatus`，不展示额度、余额或配额窗口；保留凭据是否已配置、登录进度和保存错误等设置反馈。
- `pnpm test` 9 项、`pnpm typecheck`、生产依赖审计（无已知漏洞）和 Tauri release `--no-bundle` 构建通过；debug `.app` 构建通过。
- 隔离 `.app` 实际检查：设置页首次只展开 Claude Code，其余六项收起；Codex 可独立展开且 Claude 保持展开，Claude 可再独立收起。设置页无额度/余额数据。主窗可由键盘展开，五个额度环及 Claude 详情卡正常显示。
- 默认 `pnpm build` 完成前端和 Rust release 编译后，仍在已知的 x64 DMG `bundle_dmg.sh` 失败。明确 arm64 CI 构建又被本机 x64 Node / arm64 Rust 场景下的嵌套 pnpm 11.0.6 与项目 11.20.0 检查阻断；未把包封装标记为通过。

已执行：

- JS 桥命令/事件取消竞态自检通过。
- Rust 配置非法输入、原子保存失败保留旧值、屏幕边界、Cursor TEXT/UTF-16LE/WAL、缺失额度、OAuth state 和取消检查通过。
- 隔离模式专门测试通过：HTTP 客户端、Cursor/Antigravity 采集、凭据读写全部阻断。
- macOS debug 可执行文件构建通过，Clippy `-D warnings` 通过（最终复核持续更新）。
- macOS debug `.app` 已构建成功；隔离模式实际验证：二次启动唤醒原窗口、打开偏好设置、保存顶部停靠、配额环显示、原生菜单打开账户页、点击登录返回隔离阻断提示。
- 测试窗口已关闭，未进行真实登录或凭据外发。
- `git diff --exit-code -- src/renderer` 通过，原界面无修改。

尚未完成：

- 剩余交互（托盘点击、跨屏拖拽、连续悬停/折叠）验证。
- Windows/Linux 构建和运行；CI 文件尚未运行。
- 五渠道真实账号 API Key、登录/退出/过期/刷新验收。
- GLM/DeepSeek 登录协议与实现，入口明确禁用。
- 独立组织 Admin 账单查询；现有 Codex/Claude 普通 Key 验证与订阅额度分开。
- Antigravity 多进程、进程重启以及三平台真实 IDE 场景。

运行检查首次被自动审批拒绝：仅隔离配置不足以保证不读取 Cursor 凭据。随后增加强制演示、阻断供应商/网络/凭据/登录的 debug 模式，并通过专门测试，受限启动已获准。

Release 进展：显式 `--target aarch64-apple-darwin --bundles app --no-sign` 构建通过。默认 `pnpm build` 在 DMG 封装的 `hdiutil create` 处失败（设备未配置），且本机 Node x64 / Rust arm64 混用会导致默认包名误标为 x64；已改用明确的 arm64 目标，不交付误标文件。

DMG 封装已通过：在获准使用系统磁盘映像工具后，`CI=true pnpm exec tauri bundle --target aarch64-apple-darwin --bundles dmg --no-sign --ci --verbose` 成功生成 arm64 DMG，临时映像已卸载。CI 模式跳过 Finder AppleScript，只影响安装盘图标布局；未使用签名凭据，未执行签名、公证或发布。

最终已通过：pnpm 冻结锁安装、3 项 JS 自检、7 项常规 Rust 测试、1 项独立隔离测试、Clippy `-D warnings`、rustfmt、renderer 无改动检查。源码与平台完整验收仍按上文未完成项区分。

最终产物复核：`CI=true pnpm exec tauri build --target aarch64-apple-darwin --no-sign --ci` 在最终源码上重新编译并成功生成 `.app` 和 `Pulse_1.0.0_aarch64.dmg`（约 6.7 MiB）。产物目录：`src-tauri/target/aarch64-apple-darwin/release/bundle/`。这是未签名的本地开发验收产物，不代表剩余认证与平台要求已经完成。

## 2026-09-08 方向切换裁切修复

- 根因：配置推送用 `className` 覆盖停靠方向，同时移除了 `collapsed`；Tauri 仍保持 18px 收起尺寸，导致展开内容被裁切。
- 修复：统一方向应用函数，只更新方向类，保留展开状态，并清理旧方向详情卡片位置。默认配置改为真实数据；用户现有配置的 demoMode 已关闭。
- `tests/docking.test.cjs` 在修复前源码上失败，在修复后通过，覆盖收起/展开下左、顶部、右方向切换。
- Node 4 项测试、Rust 7 项测试通过，1 项隔离测试按原设置忽略；格式与差异检查通过。
- macOS 隔离运行实际确认顶部切至左侧后五个圆环完整显示；此 UI 检查使用隔离演示数据，不作为真实账号采集成功证据。
- 修复版 macOS arm64 `.app`/`.dmg` 打包通过；Clippy `--all-targets -D warnings` 通过（将桌面测试模块移至文件末尾）。
- 已启动真实模式并打开账户页：Claude/Codex/Kimi 尚未配置凭据；Cursor 数据库不可用；Antigravity 当前用户语言服务未运行；GLM/DeepSeek 未启用。未获取到真实配额，不将模式切换视为账号连接成功。

## 2026-09-09 Codex 数据与设置保存

- 实际复现旧版保存按钮点击后无反馈，稍后才关闭；`save_config` 在持久化后仍等待全渠道刷新，前端还会再次等待 `loadData`。现改为持久化完成即返回，后台刷新；按钮显示保存中、防重复提交，成功关闭并提示，失败保留表单及错误提示。
- Codex 原解析遗漏模型/代码审查窗口，固定将主窗口标为 Session，并在投影时丢弃数字重置时间。现保留全部已支持窗口、实际时长、套餐、积分与限额状态。
- 补充头像 SVG 尺寸；详情卡限制最大高度并允许滚动，避免多窗口数据超出可见区域。
- 回归测试在旧实现上失败：四窗口只解析为一个；保存无进行中状态；失败未捕获。修复后 Node 7 项、Rust 9 项通过（专用隔离测试仍按标记忽略）。
- Clippy `--all-targets -D warnings` 与 macOS arm64 应用/DMG 构建通过。
- 真实账号运行确认账户页显示主每周窗口、Spark 5 小时及每周窗口、各自重置时间、套餐和积分余额；非演示模式。
- 原生设置实测：点击保存后同次 UI 检查已关闭弹窗，出现“已保存，数据正在后台刷新”。失败保留表单和提示、重复点击保护通过 Node 回归测试验证。

## 2026-09-09 Antigravity 登录补全

- 根因：能力表将 Antigravity 标记为仅复用桌面客户端，认证注册表没有该 provider，数据采集也无 OAuth 分支，所以账户页登录按钮被禁用。
- 新增 Google OAuth、动态 loopback 回调、refresh token、Cloud AI Companion project 发现/初始化，以及 project-scoped 远程配额查询；远程失败后仍保留本机语言服务回退。
- 回归检查覆盖登录能力开关、OAuth 端点配置、state 校验、project/default tier 解析，以及根级 Antigravity quota groups 的全部 bucket 投影。
- Rust 11 项通过、1 项隔离网络测试按标记跳过；Node 7 项通过；Clippy `--all-targets -D warnings`、rustfmt 和差异检查通过。最终 macOS arm64 `.app` 与未签名 DMG 构建成功。
- 重启最终 `.app` 后打开账户页，确认 Antigravity 显示可操作的“登录”按钮与 Google OAuth 说明；未点击该按钮。
- 未在自动测试中启动真实 Google 登录，也没有读取或记录用户凭据；真实账户授权需由用户在系统浏览器完成。

## 2026-09-09 额度取整与跨应用悬浮

- 后端共享 `quota` 入口统一将额度向上取整并限制到 100；账户页移除一位小数格式。回归用例覆盖 `2.1760200000000007 → 3` 和 `100.1 → 100`。
- 主监控窗创建时保持置顶并接收失焦后的首次鼠标事件；失焦和重新定位时再次确认置顶层级。窗口管理器不支持置顶时仍继续完成位置更新。
- macOS 最终构建在 Chrome 前台时仍显示 Pulse 边缘入口。自动化工具没有独立的无按键 hover 操作，因此精确 `mouseenter` 手势仍需人工复核。
- Rust 12 项、Node 7 项通过，1 项隔离网络测试按标记跳过；Clippy、rustfmt、差异检查及 macOS arm64 `.app`/DMG 构建通过。

## 2026-09-09 登录协议与侧边栏启用项

- 对照 qunqin24/Pulse 当前实现，将 Codex 从不可用的 loopback OAuth 改为 OpenAI 设备码：请求用户码、轮询 403/404、取得授权码与证明密钥后交换 token。Claude Code 改用 `claude.com/cai/oauth/authorize`、动态 loopback 端口和 `user:profile` scope。
- 主侧边栏以 `config.providers[].enabled` 生成槽位。无有效额度时保留平台：缺少鉴权显示待配置卡片，已有鉴权但读取失败显示暂不可用；“去配置”通过受校验的 provider ID 唤醒设置窗并展开对应 Accordion。
- `pnpm test` 10 项、Rust 14 项（1 项隔离网络测试按标记跳过）、TypeScript、Vite、Clippy `-D warnings`、rustfmt 和 debug `.app` 构建通过。隔离窗口实际显示仅两个已启用平台；隔离模式会强制演示指标，因此待配置卡片的真实点击定位由桥接/命令/Accordion 契约覆盖，仍需非隔离无凭据环境人工复核。
- 未发起真实 OAuth，也未读取或记录用户凭据。Codex、Claude Code、Kimi、Antigravity 登录及刷新仍分别需要真实账号验收；GLM/DeepSeek 登录协议继续保持未实现。

## 2026-09-09 设置自动保存与闪动修复

- 根因：页面级保存走通用操作流程，持久化后再次全量加载配置、能力和鉴权状态；桥接层还会命令式清空受 React 控制的密码输入，随后被 React 恢复，形成可见闪动。
- 显示、数据和平台启用设置现为乐观更新后立即保存，不再显示页面级保存按钮或成功后全量加载。失败保留当前选择并显示“自动保存失败”。
- API Key、登录、退出及 Cursor 自定义目录仍保留显式按钮。Node 12 项、TypeScript 和 Vite 构建通过。
