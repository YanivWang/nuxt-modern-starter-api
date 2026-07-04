/**
 * 文件职责：集中声明大文件上传的公开容量上限。
 * schema、文档和提示文案都应复用这里的常量，避免限制分散。
 */
/** 单文件最大字节数（当前为 1024MB） */
export const LARGE_UPLOAD_MAX_FILE_BYTES = 1024 * 1024 * 1024;

/** 用于提示文案的整数 MB（= 1024） */
export const LARGE_UPLOAD_MAX_FILE_MB = LARGE_UPLOAD_MAX_FILE_BYTES / (1024 * 1024);
