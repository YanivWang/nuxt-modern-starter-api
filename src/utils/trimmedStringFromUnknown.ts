/** 将未知输入转为 trim 后的字符串；忽略对象、数组、null、undefined（返回 ""）。 */
export function trimmedStringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}
