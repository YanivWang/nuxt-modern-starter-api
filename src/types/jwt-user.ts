/**
 * 文件职责：描述项目写入 JWT payload 的用户字段。
 * jsonwebtoken 自带 JwtPayload 会补充 exp/iat/jti 等标准字段，这里补上业务 id 与 username。
 */
import type { JwtPayload } from "jsonwebtoken";

export type AppJwtUser = JwtPayload & {
  id: number;
  username: string;
  jti?: string;
  exp?: number;
  iat?: number;
};
