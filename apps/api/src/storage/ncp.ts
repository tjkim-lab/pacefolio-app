/* NCP Object Storage 어댑터 (#19 완성) — S3 호환 API (인프라 결정 2026-07-19).
   presigned URL 방식: 서버는 서명만 하고 파일 바이트는 클라이언트↔스토리지 직통.
   엔드포인트만 바꾸면 AWS S3 로도 그대로 동작(사업자 이동 비용 = env 4개). */
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageAdapter } from "./adapter";

export interface NcpStorageConfig {
  endpoint: string;   // 예: https://kr.object.ncloudstorage.com
  region: string;     // 예: kr-standard
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createNcpObjectStorage(cfg: NcpStorageConfig): StorageAdapter {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: true, // NCP Object Storage 는 path-style
  });
  return {
    name: "ncp-object-storage",
    async createUploadTarget(key, contentType, nowISO) {
      const url = await getSignedUrl(client, new PutObjectCommand({
        Bucket: cfg.bucket, Key: key, ContentType: contentType,
      }), { expiresIn: 600 });
      return {
        url, method: "PUT",
        headers: { "content-type": contentType },
        expiresAt: new Date(new Date(nowISO).getTime() + 600_000).toISOString(),
      };
    },
    async getDownloadUrl(key, ttlSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), {
        expiresIn: ttlSeconds,
      });
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return true;
      } catch {
        return false; // NotFound 포함 — 판정 불가도 fail-closed(finalize 거부)
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },
  };
}

/** env 로 어댑터 선택 — 4개 전부 있으면 NCP, 아니면 null(호출부가 dev/501 결정) */
export function ncpStorageFromEnv(): StorageAdapter | null {
  const endpoint = process.env.PACEFOLIO_STORAGE_ENDPOINT;
  const bucket = process.env.PACEFOLIO_STORAGE_BUCKET;
  const accessKeyId = process.env.PACEFOLIO_STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.PACEFOLIO_STORAGE_SECRET_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return createNcpObjectStorage({
    endpoint, bucket, accessKeyId, secretAccessKey,
    region: process.env.PACEFOLIO_STORAGE_REGION ?? "kr-standard",
  });
}
