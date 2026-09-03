/**
 * 文件职责：为每个请求准备 requestId。
 * 只在客户端传入的 X-Request-Id 形状合法时透传，否则生成 UUID，并回写响应头。
 * 不校验字符集就等于让外部往日志里写任意文本，见 SAFE_REQUEST_ID。
 */
import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const HEADER = "x-request-id";

/**
 * 只接受这个形状的上游 id：字母数字、下划线、点、连字符，1~128 位。
 *
 * requestId 会进每一条日志、还会原样回写到响应头，是一段完全由调用方提供的文本。
 * 只截断长度而不限字符集，等于允许外部往日志里塞任意内容 —— 日志被下游按分隔符切分、
 * 或被人 grep 时，这段内容就成了噪声甚至误导。形状不合就当它没传，自己生成一个。
 * 前端 server/middleware/request-id.ts 用的是同一条规则，两端保持一致。
 */
const SAFE_REQUEST_ID = /^[\w.-]{1,128}$/;

/** 透传形状合法的客户端 X-Request-Id，否则生成 UUID，并写回响应头便于追踪 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get(HEADER)?.trim();
  const id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
