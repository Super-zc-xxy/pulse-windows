# Pulse for Windows (AI 编码配额屏幕边缘悬浮监视器)

> 优雅、灵动、零干扰的 Windows 桌面边缘 AI 编程额度监视器，忠实复刻并升级 macOS 原版 Pulse 体验。

<p align="center">
  <b>实时追踪 Claude Code、Codex、Cursor、Antigravity、Kimi、GLM、DeepSeek 等 AI 编程助手与大模型的配额余量与重置周期。</b>
</p>

---

## 🌟 核心特性

1. **全自由边缘停靠与磁吸自适应（Smart Edge Docking & Snapping）**
   - **三向自由停靠**：支持停靠在屏幕**右侧**、**左侧**或**顶部**。
   - **随心拖拽 & 智能磁吸**：按住主胶囊即可在边缘平滑滑动；拖近其他屏幕边缘时会自动吸附并无缝切换横向/竖向形态。
   - **自动极简折叠**：鼠标移开后平滑收缩为一条 18px 宽的半透明微光细条（Sliver），绝不遮挡代码编辑与日常窗口。
   - **悬停瞬间唤醒**：鼠标滑过边缘光条毫秒级展开完整监控胶囊；点击空白区域瞬时智能收拢。

2. **多态配额环（Status Rings）与动态色彩**
   - **双模式一键切换**：支持“已用配额（% used）”与“剩余可用配额（% left）”随时切换。
   - **智能状态渐变**：根据消耗健康度自动呈现 **翡翠绿（充裕） → 琥珀黄（告警） → 荧光红（告急）**。
   - **活动呼吸光点**：AI 任务运行或生成中时，圆环外沿显示灵动运转的动态光斑。

3. **悬浮扩展详情卡片（Flyout Breakdown）**
   - 鼠标触碰圆环即可展开 Obsidian 暗夜玻璃质感卡片。
   - 动态计算并展示各项额度细分（Session Allowance、Weekly Cap 等），长列表自动测高适配防截断。
   - 包含重置时间倒计时、消耗速率评估（Burn-Rate Forecast）以及健康状态指示。

4. **纯粹静默与极客体验**
   - **不占任务栏（Skip Taskbar）**：纯后台边缘悬浮与系统托盘驻留，还任务栏清爽空间。
   - **静默后台启动**：开机自启/快捷方式启动无多余弹窗打扰。
   - **多实例防重**：重复双击快捷方式直接唤醒现有面板，并立即触发最新配额数据同步。

5. **隐私至上与本地优先（Local-First & Privacy First）**
   - **零数据上报**：无云端中转服务器、无需注册第三方账号、无用户行为遥测。
   - **本地无感读取**：自动兼容本地 CLI 授权缓存（~/.claude/、~/.codex/、Cursor 等）。
   - **开放 API 配置**：支持在偏好设置面板自主输入 Kimi、GLM、DeepSeek 等平台的 API Key。

---

## 🚀 快速开始

### 环境准备
- Node.js 18+ 或更高版本
- pnpm（推荐）或 npm

### 本地安装与启动
`ash
# 1. 克隆本仓库
git clone https://github.com/你的用户名/pulse-win.git
cd pulse-win

# 2. 安装依赖
pnpm install

# 3. 运行开发环境
pnpm start
`

### 生成桌面快捷方式与开机自启
项目内置了 Windows 自动化脚本：
`ash
# 生成带自研炫彩图标的桌面快捷方式
node create-shortcut.js

# 添加开机静默自启（可选）
node add-startup.js
`

---

## ⚙️ 偏好设置指南

点击悬浮轨底部的齿轮图标或通过托盘右键菜单，即可打开**偏好设置**：
- **屏幕停靠位置**：右边缘 / 左边缘 / 顶边缘（亦可直接拖拽胶囊自动吸附换边）
- **圆环数值模式**：显示已用 (% used) / 显示剩余 (% left)
- **数据源模式**：演示模拟模式（Mock 快速体验）/ 本地真实数据（Local CLI）
- **模型渠道勾选与 API Key 配置**：按需勾选展示的模型，并配置对应密钥。

---

## 📁 项目结构

`	ext
pulse-win/
├── assets/                  # 应用图标（icon.ico 等）与设计资源
├── src/
│   ├── main/                # Electron 主进程
│   │   ├── index.js         # 主窗口生命周期、屏幕边界计算、拖拽吸附
│   │   ├── store.js         # 本地配置持久化 (electron-store)
│   │   ├── tray.js          # 系统托盘与快捷菜单
│   │   └── providers/       # 各 AI 渠道配额探测与读取适配器
│   ├── preload/             # 上下文隔离安全桥接 (IPC Bridge)
│   └── renderer/            # 极简前端 UI (HTML/CSS/JS)
│       ├── index.html       # 胶囊与详情卡片结构
│       ├── style.css        # 毛玻璃视觉、微光动效与排版样式
│       └── app.js           # 动画控制、鼠标悬停与交互逻辑
├── Pulse.vbs                # 静默启动 VBS 脚本
├── package.json
└── README.md
`

---

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！
1. Fork 本仓库
2. 创建特性分支 (git checkout -b feature/AmazingFeature)
3. 提交改动 (git commit -m 'Add some AmazingFeature')
4. 推送分支 (git push origin feature/AmazingFeature)
5. 新建 Pull Request

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 许可开源。
