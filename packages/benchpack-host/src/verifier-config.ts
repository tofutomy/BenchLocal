// 兼容现有内部与测试导入路径，实际配置逻辑归入 verifier 子模块。
export {
  bootstrapVerifierConfig,
  getManifestVerifiers,
  getVerifierUrl
} from "./verifier/verifier-config.js";
