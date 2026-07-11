# BenchLocal Refactoring Recommendations

生成日期：2026-07-08

## 结论摘要

BenchLocal 的产品边界清晰：Electron 桌面宿主负责配置、模型、Bench Pack 安装、运行编排、历史记录、Verifier 生命周期和 Agent API；Bench Pack 负责场景、提示词、评分和可选 verifier。`ARCHITECTURE.md` 与代码整体方向一致，类型检查当前通过。

主要重构风险不在“能不能编译”，而在后续迭代的认知负担和回归风险：

- Renderer 侧 `app/src/renderer/src/App.tsx` 已达到约 9715 行，承载页面、状态、业务动作、弹窗、日志、运行进度、设置页和 Web Bench Pack bridge。
- Main 侧存在多个超大协调模块：`packages/benchpack-host/src/index.ts` 约 4586 行，`app/src/main/controller.ts` 约 1720 行，`app/src/main/agent-server.ts` 约 1179 行，`app/src/main/agent-mcp.ts` 约 998 行。
- 自有源码中没有跟踪到 `*.test.*` / `*.spec.*` 测试文件，根 `package.json` 也没有 test 脚本；CodeGraph 对关键符号也提示无覆盖测试。
- IPC、HTTP Agent API、MCP 工具和 renderer 调用共享同一批能力，但路由、输入校验、文档和调用映射分散，未来扩展容易重复实现。

建议先做“低行为变更、高回报”的结构性拆分：补测试基线与边界契约，再拆 renderer 状态/组件，最后拆 main controller 与 benchpack-host 的领域服务。

## 当前结构速览

- `app/src/main/`
  Electron main process，包含应用生命周期、IPC、更新、主题、日志窗口、Agent HTTP/MCP 服务和核心 controller。
- `app/src/preload/`
  暴露 `window.benchlocal` 桥接 API。
- `app/src/renderer/src/`
  React UI，目前主要集中在单个 `App.tsx` 与单个 `index.css`。
- `packages/benchlocal-core/`
  公共协议、配置、工作区、主题、Agent 协议类型和 zod 解析。
- `packages/benchlocal-sdk/`
  Bench Pack 作者 SDK。
- `packages/benchlocal-web-sdk/`
  Web Bench Pack 浏览器 SDK。
- `packages/benchpack-host/`
  Bench Pack 安装、检查、registry、verifier、运行编排和历史持久化。

## 优先级 P0：先建立重构安全网

### 1. 增加测试框架与最小契约测试

现状：

- `npm run typecheck` 通过。
- 自有源码未发现测试文件。
- 根脚本只有 build/typecheck/package/release，没有 test。

建议：

- 引入 Vitest，先覆盖纯函数和文件系统边界，不急着做 UI 大集成测试。
- 增加根脚本：
  - `test`
  - `test:watch`
  - `test:coverage`
- 第一批测试建议覆盖：
  - `packages/benchlocal-core/src/config.ts`：默认配置、旧字段兼容、非法 TOML/JSON 错误。
  - `packages/benchlocal-core/src/workspaces.ts`：workspace/tab 归一化、旧 execution mode 映射、坏引用清理。
  - `packages/benchpack-host/src/index.ts`：registry payload 校验、安装阶段状态机、verifier mode 解析、run summary merge。
  - `app/src/main/controller.ts` 拆出后的 provider/model/workspace service：增删改、级联删除模型选择、事件发射。

收益：

- 后续拆分大文件时能快速判断是否改坏行为。
- 公共 npm 包和桌面 app 的协议兼容性会更稳。

### 2. 增加边界级 smoke tests

建议补两个轻量集成测试：

- IPC contract smoke：确认 `desktop-api.ts`、preload 调用和 `ipc.ts` handler 名称一致。
- Agent API contract smoke：确认 HTTP OpenAPI、MCP tools 和 controller 方法的命名/输入输出一致。

这两块现在是自动化和外部 agent 的入口，破坏后用户感知会很强。

## 优先级 P1：拆 Renderer 巨型 App

### 3. 将 `App.tsx` 拆成 feature-first 结构

现状：

- `App.tsx` 约 9715 行。
- `App` 从约 `App.tsx:2138` 开始，集中维护大量 `useState`、`useMemo`、`useRef`、IPC 调用和业务动作。
- CodeGraph 显示 `App` 直接渲染 `DetachedLogsWindow`、`WebBenchPackSection`、`BenchPackPickerTrigger`、`SettingsScene`、`Banner`、`BenchmarkSection` 等组件。

建议目标结构：

```text
app/src/renderer/src/
  app/
    App.tsx
    useAppBootstrap.ts
    useToasts.ts
    useThemeApplication.ts
  features/
    benchpacks/
      BenchPackPicker.tsx
      BenchPackRegistry.tsx
      useBenchPackMutations.ts
    runs/
      BenchmarkSection.tsx
      RunHistoryModal.tsx
      RunLogDrawer.tsx
      useRunLifecycle.ts
    settings/
      SettingsScene.tsx
      ProvidersSettings.tsx
      ModelsSettings.tsx
      AgentSettings.tsx
      VerificationSettings.tsx
    workspaces/
      WorkspaceSidebar.tsx
      TabStrip.tsx
      useWorkspaceActions.ts
    webpacks/
      WebBenchPackSection.tsx
      useWebBenchPackBridge.ts
    logs/
      DetachedLogsWindow.tsx
  shared/
    components/
    hooks/
    formatters/
```

迁移顺序：

1. 先抽纯 formatter/helper，不改 JSX。
2. 抽 `useToasts`、`useThemeApplication`、`useWorkspaceActions` 等 hook。
3. 抽低耦合弹窗和子视图，例如 about/history/logs/settings tab 内容。
4. 最后拆 `BenchmarkSection` 和 Web Bench Pack bridge。

注意：

- 每次只移动一个垂直切片，保持 props 显式。
- 避免一开始引入全局状态库；当前状态可先通过 hooks 和 context 分层。
- 抽出的 hooks 要优先覆盖测试，尤其是 workspace state 更新和 run lifecycle。

### 4. 将 `index.css` 拆成基础层与 feature 样式

现状：

- `app/src/renderer/src/index.css` 约 76447 bytes。

建议：

- 保留 `index.css` 作为入口，只放 fonts、tokens、base layout。
- 按 feature 拆分：
  - `styles/tokens.css`
  - `styles/base.css`
  - `features/settings/settings.css`
  - `features/runs/runs.css`
  - `features/workspaces/workspaces.css`

收益：

- UI 拆组件时样式也能同步收口。
- 减少新增页面时误改全局选择器的概率。

## 优先级 P1：拆 Main Controller 与 Agent Surface

### 5. 将 `BenchLocalController` 拆成领域服务

实施状态（2026-07-12）：已完成。

- 已拆出 config、workspace、provider、model、benchpack、run、history、verifier 和 agent event 等领域服务。
- `BenchLocalController` 保留为兼容 IPC、HTTP 与 MCP 调用方的轻量 facade，目前约 330 行。
- provider/model、workspace、Bench Pack/history、run lifecycle 与 verifier 等服务已增加针对性测试。

现状：

- `app/src/main/controller.ts` 约 1720 行。
- `BenchLocalController` 同时负责 config/workspace/provider/model/benchpack/run/history/verifier/agent event。
- 多个外部入口依赖它：IPC、HTTP Agent API、MCP。

建议拆分：

```text
app/src/main/services/
  config-service.ts
  workspace-service.ts
  provider-service.ts
  model-service.ts
  benchpack-service.ts
  run-service.ts
  history-service.ts
  verifier-service.ts
  agent-event-bus.ts
```

保留一个轻量 facade：

```text
app/src/main/controller.ts
```

Facade 只组合 services，保持现有 IPC/Agent 调用方短期不用大改。

第一阶段优先拆：

- provider/model CRUD：逻辑相对纯，风险较低。
- workspace mutation：需要测试保护，收益高。
- run lifecycle：最后拆，因为涉及 active run、abort、进度事件和历史持久化。

收益：

- Main 侧能力可以被 IPC、HTTP、MCP 复用，但实现不用继续堆到同一个类。
- 单元测试可以直接打 service，不必启动 Electron。

### 6. 抽一个统一的 Agent capability registry

实施状态（2026-07-12）：已完成，采用 registry 与传输适配器分层实现。

- `capabilities.ts` 统一维护 capability id、HTTP/MCP 映射与共享 handler，`schemas.ts` 统一维护可复用输入 schema。
- HTTP、MCP transport、resources、只读工具、写工具、OpenAPI 和 guide 已拆成独立模块；`agent-server.ts` 与 `agent-mcp.ts` 仅保留协议及生命周期编排。
- OpenAPI/guide 继续保持纯函数，而不是把全部描述元数据集中到单个大对象；全量契约测试确保 registry 中每个能力都有 MCP tool 和 OpenAPI path，防止映射漂移。

现状：

- `agent-server.ts` 处理 HTTP 路由和 OpenAPI/guide。
- `agent-mcp.ts` 注册 MCP tools/resources。
- 两者都调用 `BenchLocalController`，但能力清单、参数解析、描述文档分散。

建议：

```text
app/src/main/agent/
  capabilities.ts
  http-router.ts
  mcp-router.ts
  openapi.ts
  guide.ts
  schemas.ts
```

`capabilities.ts` 定义一次：

- capability id
- 输入 schema
- 输出 schema
- auth/safety metadata
- handler
- HTTP 映射
- MCP tool/resource 映射
- 文档描述

收益：

- 新增 UI 功能给 agent 使用时，只需要登记一个 capability。
- OpenAPI、MCP 和 Markdown guide 可以从同一份 registry 生成，减少漂移。

### 7. IPC channel 常量和 handler 注册集中化

实施状态（2026-07-12）：已完成。

- `ipc-contract.ts` 集中定义 channel，并从 `BenchLocalDesktopApi` 推导 invoke、event 和 message 的请求/响应类型。
- Main 与 preload 已通过 typed helper 注册、调用和发送 IPC，不再散落原始 channel 字符串。
- IPC contract smoke test 覆盖 channel 唯一性、preload/main 注册对称性、事件 producer 完整性和原始字符串回流。

现状：

- `app/src/preload/index.ts` 内有大量 channel 字符串和 `ipcRenderer.invoke`。
- `app/src/main/ipc.ts` 注册 handler。
- `app/src/shared/desktop-api.ts` 定义 TypeScript 接口。

建议：

```text
app/src/shared/ipc-contract.ts
```

集中定义：

- channel 名称
- request/response 类型
- main handler helper
- preload invoke helper

收益：

- channel 重命名或新增时，有类型层面的同步约束。
- 后续可以更容易做 IPC contract smoke test。

## 优先级 P2：拆 Bench Pack Host

### 8. 将 `packages/benchpack-host/src/index.ts` 拆成 host 子模块

现状：

- 文件约 4586 行。
- 同时包含 registry、下载/解包/安装、manifest inspection、verifier、runtime load、run execution、history、model availability、artifact writing 等。

建议目标结构：

```text
packages/benchpack-host/src/
  index.ts
  registry/
    load-registry.ts
    registry-schema.ts
  install/
    install-from-registry.ts
    install-from-url.ts
    artifact-staging.ts
    manifest-validation.ts
  inspect/
    inspect-configured-packs.ts
    load-manifest.ts
  verifier/
    docker.ts
    health-check.ts
    verifier-config.ts
  runtime/
    load-runtime.ts
    host-context.ts
    model-resolution.ts
  runs/
    run-benchpack.ts
    execution-plan.ts
    progress-events.ts
    history-store.ts
  providers/
    model-availability.ts
    inference-endpoints.ts
```

迁移顺序：

1. 抽 registry 和 manifest schema，测试最容易补。
2. 抽 history store 和 progress event merge。
3. 抽 provider/model availability。
4. 抽 install pipeline。
5. 最后抽 run execution/verifier，因为外部副作用最多。

收益：

- 公共 host 包会更像一个可维护库，而不是桌面 app 的内部脚本。
- Bench Pack 安装/运行的失败场景可以分层测试。

## 优先级 P2：协议与兼容性治理

### 9. 给 core schema 增加显式 migration 层

现状：

- `config.ts` 和 `workspaces.ts` 已经有 zod 解析和一些旧字段兼容，例如 workspace execution mode 映射、`pluginId` 到 `benchPackId`。
- 随着 `schema_version: 1` 演进，兼容逻辑会继续散落在 normalize 函数里。

建议：

```text
packages/benchlocal-core/src/migrations/
  config-v1.ts
  workspace-v1.ts
```

每个 persisted document 都遵循：

1. parse raw unknown
2. migrate legacy shapes
3. normalize defaults
4. validate final shape

收益：

- 老用户本地 `~/.benchlocal` 数据升级风险可控。
- 以后引入 `schema_version: 2` 不需要重写当前 normalize。

### 10. 明确 public/private package 边界

现状：

- 文档声明 public npm packages 是 `@benchlocal/core` 和 `@benchlocal/sdk`。
- 实际 workspace 还有 `@benchlocal/web-sdk`，且 README 已描述 Web Bench Packs。
- `@benchlocal/benchpack-host` private，仅 app 内部使用。

建议：

- 更新 `ARCHITECTURE.md` 的 public package boundaries，明确 `@benchlocal/web-sdk` 是否也是公开稳定包。
- 给 public 包增加 API extractor 或至少 `tsd`/type tests，防止无意破坏导出类型。
- app 内通过 alias 指向 package source 是合理的，但应在文档里说明 development build 和 package publish build 的关系。

## 优先级 P3：工程卫生与发布维护

### 11. 增加 lint/format 基线

建议：

- 添加 ESLint flat config，覆盖 TypeScript + React hooks。
- 添加 Prettier 或明确不使用 formatter 的代码风格约束。
- 根脚本增加：
  - `lint`
  - `format:check`
  - `ci`

`ci` 建议包含：

```text
npm run typecheck
npm run test
npm run lint
npm run build:compile
```

### 12. 发布脚本保留，但抽共用命令工具

现状：

- `scripts/setup-macos-release.mjs`
- `scripts/check-macos-release.mjs`
- `scripts/build-macos-release.mjs`
- `scripts/release-env.mjs`

这些脚本职责清晰，暂不需要大改。建议只补：

- release 脚本测试：`.env.release.local` parsing、required field validation、identity normalization。
- dry-run 模式：打印将要执行的命令和产物路径，不触发真实 notarization。

## 建议路线图

### 第 1 周：安全网

- 引入 Vitest。
- 补 core config/workspace tests。
- 补 benchpack-host registry/manifest tests。
- 增加 `npm run test` 和 `npm run ci`。

### 第 2-3 周：Renderer 拆分

- 抽 toast/theme/workspace hooks。
- 抽 settings、logs、history、benchpack picker 组件。
- `App.tsx` 目标先降到 3000 行以内。

### 第 4-5 周：Main 服务拆分

- 抽 provider/model/workspace services。
- 保留 `BenchLocalController` facade。
- 给 service 增加单元测试。

### 第 6-7 周：Agent/IPC 契约统一

- 抽 Agent capability registry。
- 从 registry 生成 OpenAPI/MCP/guide。
- 抽 `ipc-contract.ts` 并补 smoke test。

### 第 8 周以后：Bench Pack Host 深拆

- 按 registry、install、runtime、runs、verifier 分层迁移。
- 每迁移一层补测试。
- 保持 `packages/benchpack-host/src/index.ts` 只做 public exports。

## 验证清单

每个重构 PR 至少跑：

```text
npm run typecheck
npm run test
```

涉及 UI：

```text
npm run dev
```

手工检查：

- 启动 app。
- 加载配置和 workspace。
- 安装/更新/卸载 Bench Pack。
- 运行一个非 verifier Bench Pack。
- 运行一个 verifier Bench Pack 或至少检查 verifier status。
- 打开 Agent Access，验证 `/v1/health`、`/v1/openapi.json`、`/mcp`。
- 打开日志抽屉和 detached logs window。

## 最小推荐落地顺序

如果只做三件事，建议按这个顺序：

1. 补测试框架与 core/host 的第一批单元测试。
2. 拆 `App.tsx` 的 hooks 和 settings/logs/history 组件。
3. 抽 `BenchLocalController` 的 provider/model/workspace services，同时保留 facade。

这三步不会强迫产品形态变化，但会明显降低之后新增 Bench Pack、Agent 能力、UI 工作流和 verifier 功能的维护成本。
