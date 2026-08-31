/**
 * 文件职责：定义上传接口的响应契约。
 *
 * 分片上传的状态查询有两条返回分支（done marker 命中 / 读会话元信息），
 * 两条分支的字段并不相同；schema 如实描述这一点，Port 类型也由它推导，
 * 否则 Port 里少声明的字段会以「多返回几个字段」的形式静默存在，谁也不知道它算不算契约。
 */
import { z } from "zod";

import { apiEnvelope } from "../../shared/http/api-envelope.js";

/** 上传接口返回的都是 /uploads/... 站内相对路径，由前端按 apiBase 拼成绝对 URL。 */
export const imageUploadResultSchema = z.object({
  urls: z.array(z.string()),
});

/**
 * instant=true 表示全局 MD5 索引命中、服务端直接秒传：
 * 此时没有 uploadId，客户端必须走 publicUrl 收尾，不能继续发分片。
 */
export const largeUploadInitResultSchema = z.discriminatedUnion("instant", [
  z.object({
    instant: z.literal(true),
    publicUrl: z.string(),
    chunkTotal: z.literal(0),
    expiresAt: z.string(),
  }),
  z.object({
    instant: z.literal(false),
    uploadId: z.string(),
    chunkTotal: z.number().int().positive(),
    expiresAt: z.string(),
  }),
]);

export type InitLargeUploadResult = z.infer<typeof largeUploadInitResultSchema>;

/**
 * publicUrl 只在任务已完成时出现；fileName/fileSize/chunkSize 只在任务仍在进行时出现。
 * 两组字段互斥但都写成 optional：客户端本来就该先看 status 再取字段。
 */
export const largeUploadStatusSchema = z.object({
  status: z.enum(["uploading", "merging", "done", "failed"]),
  chunkTotal: z.number().int().nonnegative(),
  receivedIndices: z.array(z.number().int().nonnegative()),
  publicUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().int().optional(),
  chunkSize: z.number().int().optional(),
});

export type LargeUploadStatus = z.infer<typeof largeUploadStatusSchema>;

/** merged=false 表示任务此前已合并过，本次是幂等重放，url 仍然有效。 */
export const largeUploadMergeResultSchema = z.object({
  url: z.string(),
  merged: z.boolean(),
});

export type LargeUploadMergeResult = z.infer<typeof largeUploadMergeResultSchema>;

export const chunkAcceptedSchema = z.object({
  chunkIndex: z.number().int().nonnegative(),
});

/** 取消任务返回空对象而非 null，历史如此；改成 null 属于破坏性变更。 */
export const emptyDataSchema = z.object({});

export const imageUploadEnvelopeSchema = apiEnvelope(imageUploadResultSchema);
export const largeUploadInitEnvelopeSchema = apiEnvelope(largeUploadInitResultSchema);
export const largeUploadStatusEnvelopeSchema = apiEnvelope(largeUploadStatusSchema);
export const largeUploadMergeEnvelopeSchema = apiEnvelope(largeUploadMergeResultSchema);
export const chunkAcceptedEnvelopeSchema = apiEnvelope(chunkAcceptedSchema);
export const emptyDataEnvelopeSchema = apiEnvelope(emptyDataSchema);
