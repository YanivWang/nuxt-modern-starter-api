/**
 * 文件职责：扩展 Express Request 类型。
 * 项目中间件会写入 validated、requestId 和 user，controller 通过这些字段读取校验结果与登录态。
 */
import type { AppJwtUser } from "./jwt-user.js";

declare global {
  namespace Express {
    interface Request {
      /** express.json() 解析结果；业务数据请使用 `validated`（Zod 清洗后） */
      body: unknown;
      /** `validate(schema)` 成功后为 `z.infer<typeof schema>` */
      validated?: unknown;
      requestId?: string;
      user?: AppJwtUser;
    }
  }
}

export {};
