/**
 * 文件职责：把未知输入安全归一化成 trim 后的字符串。
 * 只接受字符串和基础 primitive，避免对象/数组被隐式转换成误导性的字符串。
 */
/** 将未知输入转为 trim 后的字符串；忽略对象、数组、null、undefined（返回 ""）。 */
export function trimmedStringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}
