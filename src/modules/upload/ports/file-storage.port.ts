/** 文件职责：声明普通文件存储和公开 URL 转换能力。 */
export interface FileStorage {
  readonly root: string;
  ensureRoot(): void;
  toPublicUrl(absolutePath: string): string;
}
