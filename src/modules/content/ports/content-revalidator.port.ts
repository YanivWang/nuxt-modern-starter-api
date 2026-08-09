/** 文件职责：声明内容变更后的前端缓存刷新能力。 */
export interface ContentRevalidator {
  revalidateNews(slug: string): void;
}
