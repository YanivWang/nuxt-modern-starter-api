import type { JwtPayload } from "jsonwebtoken";

export type AppJwtUser = JwtPayload & {
  id: number;
  username: string;
  jti?: string;
  exp?: number;
  iat?: number;
};
