/** 文件职责：上传模块公开入口，只暴露路由工厂和存储 Ports。 */
export { createUploadRoutes } from "./upload.routes.js";
export type { FileStorage } from "./ports/file-storage.port.js";
export type { LargeUploadStorage } from "./ports/large-upload-storage.port.js";
