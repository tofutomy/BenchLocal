import { promises as fs } from "node:fs";

// 文件系统读取辅助保持无业务状态，供 registry、inspection 和 history 复用。
export async function readJsonFile<TValue>(targetPath: string): Promise<TValue> {
  const raw = await fs.readFile(targetPath, "utf8");
  return JSON.parse(raw) as TValue;
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
