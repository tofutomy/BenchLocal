// Registry 安装与更新入口独立成边界，具体 staging/commit 仍由共享 pipeline 复用。
export {
  installBenchPackFromRegistry,
  updateBenchPackFromRegistry
} from "./install-pipeline.js";
