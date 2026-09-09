# Spec: React 前端重构

状态：2026-09-09 用户已批准开发。本文覆盖 `SPEC.md` 中“保持 renderer 原样”和“不增加新前端框架”两项旧约束；其余 Tauri、认证、配额和桌面行为契约保持不变。

## Objective

将主悬浮窗和设置窗从原生 HTML/CSS/JavaScript 重构为 React + TypeScript，由 Vite 构建，并以 shadcn/ui 的源码组件模式承载通用控件。

重构必须保持现有用户能力：悬浮栏展开/折叠、三向停靠、额度圆环与详情、设置保存、账户启用、API Key、登录/取消/退出、状态刷新及失败反馈。业务、认证、配置和数据计算继续由 Rust 提供；React 只负责展示与交互。

## Tech Stack

- React + TypeScript，ESM。
- Vite，使用 `vite.config.ts`，一次构建 `index.html` 与 `accounts.html` 两个入口。
- shadcn/ui 源码组件；只加入实际使用的 Button、Card、Input、Label、NativeSelect、Switch、Accordion、Badge 等最小集合。
- 沿用 `window.pulseAPI` 桥接契约，不直接依赖 Tauri API。
- 不引入 TanStack Router：两个入口是两个 Tauri 原生窗口，各自没有页面级导航。出现可分享 URL 或多页面导航时再接入。
- 组件局部状态使用 React state；不增加全局状态库或数据请求库。

## Commands

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build:frontend
pnpm test
pnpm typecheck
pnpm build
```

## Project Structure

```text
index.html                         主悬浮窗 Vite 入口
accounts.html                      设置窗 Vite 入口
src/renderer/main.tsx              主悬浮窗挂载点
src/renderer/App.tsx               展开、折叠、额度和设置入口
src/renderer/components/           圆环、详情卡等主窗口组件
src/accounts/main.tsx              设置窗挂载点
src/accounts/AccountsApp.tsx       设置与账户状态编排
src/accounts/components/           设置表单和账户卡片
src/components/ui/                 实际使用的 shadcn/ui 源码组件
src/lib/                           桥接类型与无副作用格式化函数
src/bridge/pulse.js                 保持兼容的 Tauri 桥
tests/                              桥接与纯逻辑契约检查
```

## Code Style

组件使用 PascalCase，函数与变量使用 camelCase。数据读取集中在页面容器，展示组件通过明确 props 接收数据；避免单实现接口、通用表单生成器和未使用的抽象。

```tsx
export function UsageRing({ metric, mode, onInspect }: UsageRingProps) {
  const percent = mode === 'left' ? 100 - metric.usedPercent : metric.usedPercent

  return (
    <button type="button" aria-label={`查看 ${metric.name} 配额`} onMouseEnter={onInspect}>
      <UsageGauge percent={percent} icon={metric.icon} />
    </button>
  )
}
```

## Testing Strategy

- 先为迁移后的纯逻辑和双入口构建写失败检查，再实现对应代码。
- 保留桥接命令、事件取消竞态、配置保存失败保留输入、停靠方向不改变折叠状态等契约。
- `pnpm test` 运行快速 Node 测试；`pnpm typecheck` 校验 React/桥接类型；`pnpm build:frontend` 验证 Vite 双入口和桥脚本产物顺序。
- 在实际 Tauri WebView 中检查主窗和设置窗无控制台错误、键盘可操作、保存失败可恢复，并检查窄设置窗口布局。
- Rust 行为未改变时不新增后端测试；最终仍运行现有仓库完整构建。

## Boundaries

- Always：保持 `window.pulseAPI` 方法、事件名和 JSON 字段；密码输入不回显已保存 Key；保存失败保留用户输入；交互控件使用语义化元素和可见焦点。
- Ask first：改变 Rust command、窗口数量/URL、认证流程、配置结构、视觉信息架构或增加 TanStack Router/Query。
- Never：在 React 中实现认证或额度计算；读取 token；将真实模式失败回退成演示数据；为了组件化复制业务逻辑；提交密钥。

## Success Criteria

1. 仓库不再以 `src/renderer/app.js`、`src/accounts/accounts.js` 作为运行入口，两个页面均由 React + TypeScript 渲染。
2. Vite 产出 `dist/frontend/index.html`、`dist/frontend/accounts.html` 和静态资源，且 `pulse.js` 在 React 入口执行前可用。
3. 通用交互控件来自仓库内 `src/components/ui` 的 shadcn/ui 组件，样式保留现有深色、透明、紧凑的 Pulse 视觉，不套用通用后台模板。
4. 主窗保持三向停靠、展开/折叠、指标更新、详情定位和设置入口行为。
5. 设置窗保持显示配置、数据源启用、Key 保存/清除、登录/取消、GLM 站点和 Cursor 目录；不展示额度、余额或配额窗口等数据结果。
6. 每个平台使用可收起/展开的设置区，初次渲染只展开平台列表第一项，之后允许用户独立切换。
7. 加载与错误状态可见，自动保存失败时保留当前值；按钮与表单可通过键盘使用，图标按钮有可访问名称。
8. `pnpm test`、`pnpm typecheck`、`pnpm build:frontend` 通过；实际 Tauri WebView 运行检查无控制台错误。

## Open Questions

- 无阻塞问题。默认保持当前视觉与双窗口信息架构；不在本次重构中重新设计产品或引入路由。

## 2026-09-09 登录与侧边栏补充

- Codex 登录采用上游 Pulse 当前的 OpenAI 设备码流程；Claude Code 使用 `claude.com/cai/oauth/authorize`、动态 loopback 端口和只读 `user:profile` scope。继续保留 state、PKCE、取消、超时和系统凭据库存储边界。
- 侧边栏以 `config.providers[].enabled` 为唯一显示开关。已启用但没有可展示额度的平台仍占一个位置：缺少鉴权时显示“尚未配置鉴权”和“去配置”，已配置但读取失败时显示暂不可用；不得因 `getMetrics` 没有结果而消失。
- `openSettings(provider)` 必须打开或唤醒设置窗并展开对应平台。新窗口从 URL hash 读取目标，已打开窗口通过事件接收目标。
- 验收：Node 契约测试、Rust 登录协议单测、typecheck、前端构建和实际 Tauri 设置跳转通过；真实账号授权仍需人工完成，不以源码实现代替验收。

## 2026-09-09 设置自动保存

- 显示选项、数据模式、平台启用状态和 GLM 站点在变更后立即保存，不显示页面级“保存设置”按钮，也不在成功后重新加载整页。
- 自动保存失败时保留当前表单值并显示错误；API Key、登录、退出和 Cursor 自定义目录继续使用显式操作按钮。
