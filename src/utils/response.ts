import type { Response } from "express";

export function success(res: Response, msg: string, data: Record<string, unknown> = {}) {
  return res.json({
    code: 200,
    msg,
    ...data,
  });
}

export function fail(res: Response, statusCode: number, msg: string) {
  return res.status(statusCode).json({
    code: statusCode,
    msg,
  });
}
