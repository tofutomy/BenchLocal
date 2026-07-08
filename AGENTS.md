# BenchLocal — Agent Instructions

BenchLocal 是一个本地优先的 Electron 桌面应用，用于安装、运行和比较 **Bench Packs**（LLM 基准评测包）。可选的 Agent Access 功能通过 HTTP API 或 MCP Streamable HTTP 让 AI agent 控制评测工作流。

## 架构

双层架构：

- **BenchLocal 层**：桌面 UI、provider/模型注册表、Bench Pack 安装与更新、验证器生命周期、运行编排与历史
- **Bench Pack 层**：场景定义、提示词、评分逻辑（可选验证器合约）

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## Monorepo 结构

```
app/                     # Electron 桌面应用（私有）
  src/main/              # 主进程：controller, agent-server, agent-mcp, ipc
  src/preload/           # 安全桥接
  src/renderer/          # React 19 + Tailwind CSS 4 UI
packages/
  benchlocal-core/       # @benchlocal/core — 协议类型、配置 schema、主题（公开 npm）
  benchlocal-sdk/        # @benchlocal/sdk — Bench Pack 创作 SDK（公开 npm）
  benchlocal-web-sdk/    # @benchlocal/web-sdk — Web Bench Pack postMessage SDK（公开 npm）
  benchpack-host/        # @benchlocal/benchpack-host — 安装/运行编排（私有）
themes/                  # 内置桌面主题 JSON
docs/                    # 补充文档
scripts/                 # macOS 发布辅助脚本
```

## 关键源文件

| 文件 | 职责 |
|------|------|
| `app/src/main/controller.ts` | 核心业务逻辑枢纽——安装、运行、配置编排 |
| `app/src/main/ipc.ts` | 主进程 ↔ 渲染进程 IPC 桥接 |
| `app/src/main/agent-server.ts` | Agent HTTP API + SSE 事件流 |
| `app/src/main/agent-mcp.ts` | MCP Streamable HTTP 实现 |
| `packages/benchlocal-core/src/protocol.ts` | 运行时契约类型（BenchPackRuntime、HostContext、ScenarioResult 等） |
| `packages/benchlocal-core/src/config.ts` | config.toml 的 Zod 验证 schema |
| `packages/benchlocal-core/src/agent-protocol.ts` | Agent HTTP API 类型 |
| `packages/benchpack-host/src/index.ts` | Bench Pack 安装/验证/运行编排 |

## 构建与开发命令

所有命令均在仓库根目录执行（npm workspaces）：

```bash
npm run dev              # 开发模式（electron-vite dev）
npm run dev:devtools     # 开发模式 + 打开 DevTools
npm run build            # 编译所有 workspace 包 + app
npm run typecheck        # 全局类型检查（无测试框架，类型检查是主要验证手段）
npm run pack             # 编译 + 打包生产桌面应用
npm run build:win        # Windows (NSIS + ZIP)
npm run build:mac        # macOS (DMG + ZIP)
npm run build:linux      # Linux (AppImage + tar.gz)
```

子包构建：`npm run build`（等同 `tsc -p tsconfig.json`）

## TypeScript 约定

- 严格模式（`strict: true`），ES2022 target，所有包使用 ESM（`"type": "module"`）
- `benchlocal-core`：`moduleResolution: "NodeNext"`（发布到 npm 的公开包）
- `app` 及其他包：`moduleResolution: "Bundler"`（通过 electron-vite 处理）
- **无 ESLint / Prettier / Biome**，也**无测试框架**——类型检查是主要质量工具

### app 路径别名

```
@/*              → src/*
@renderer/*      → src/renderer/src/*
@core            → ../packages/benchlocal-core/src/index.ts
@benchpack-host  → ../packages/benchpack-host/src/index.ts
```

## 存储布局

```
~/.benchlocal/
  config.toml    # 持久配置（providers、models、benchpacks、主题）
  state.json     # UI 状态（workspaces、tabs、per-tab 选择）
  benchpacks/    # 已安装的 Bench Packs
  runs/          # 运行历史
  logs/
  cache/
  themes/
```

config.toml schema 见 [CONFIG_SCHEMA_V1.md](./CONFIG_SCHEMA_V1.md)。

## 协议文档

修改协议相关代码前必须阅读：

| 文档 | 内容 |
|------|------|
| [BENCH_PROTOCOL_V1.md](./BENCH_PROTOCOL_V1.md) | Bench Pack 制品结构、运行时入口、HostContext、进度事件、ScenarioResult、验证器规范 |
| [CONFIG_SCHEMA_V1.md](./CONFIG_SCHEMA_V1.md) | config.toml 完整 schema |
| [BENCH_PACK_AUTHORING.md](./BENCH_PACK_AUTHORING.md) | Bench Pack 创作指南、推荐仓库结构、打包 checklist |
| [BENCHLOCAL_REGISTRY_V1.md](./BENCHLOCAL_REGISTRY_V1.md) | 官方注册表 JSON 格式、来源类型 |
| [docs/agent-control-api.md](./docs/agent-control-api.md) | Agent HTTP 端点、MCP 工具/资源、安全规则 |

## 常见陷阱

- **验证器术语**：对外统一用 `verifier`，`sidecar` 仅是内部向后兼容别名，勿在新代码中使用
- **公开包的 moduleResolution**：修改 `benchlocal-core`、`benchlocal-sdk`、`benchlocal-web-sdk` 时保持 `NodeNext`，不要改成 `Bundler`
- **Bench Pack 安装制品**：以构建后运行时制品安装，非源码检出——`benchpack-host` 负责编排，不直接调用 npm
- **Agent Access 安全**：agent-server 使用 Bearer token 认证，绑定范围为 `localhost` 或 `local_network`，修改时遵守 [docs/agent-control-api.md](./docs/agent-control-api.md) 中的安全规则
