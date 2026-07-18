/* 스토리지 어댑터 경계 (#19 사전 코어)
   사업자(S3·R2·NCP 등) 결정과 무관하게 서비스 계층이 의존하는 유일한 계약.
   결정 후 어댑터 1개 구현으로 교체 — storageKey·서비스·DB 는 불변.
   프로덕션에서 어댑터 미주입 = 사진 라우트 501(fail-closed, 침묵 저장 금지). */

export interface UploadTarget {
  url: string;                       // 클라이언트가 직접 PUT 할 URL(실 사업자 = presigned)
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;                 // 업로드 창 만료
}

export interface StorageAdapter {
  readonly name: string;
  createUploadTarget(key: string, contentType: string, nowISO: string): Promise<UploadTarget>;
  /** 열람용 단기 URL — 권한 판정은 호출부(서비스) 책임, 어댑터는 서명만 */
  getDownloadUrl(key: string, ttlSeconds: number, nowISO: string): Promise<string>;
  /** 파일럿 P0: finalize 전 객체 실존 확인(HEAD) — 업로드 미완료 확정 금지 */
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/* ── dev 전용 인메모리 어댑터 — 계약 검증·데모용(비영속) ──
   업로드/다운로드 URL 은 API 자체의 /dev-storage 라우트(프로덕션 404 게이트). */
export interface DevStoredObject { contentType: string; byteSize: number }

export function createDevMemoryStorage(): StorageAdapter & { objects: Map<string, DevStoredObject> } {
  const objects = new Map<string, DevStoredObject>();
  return {
    name: "dev-memory",
    objects,
    async createUploadTarget(key, contentType, nowISO) {
      return {
        url: `/dev-storage/${encodeURIComponent(key)}`,
        method: "PUT",
        headers: { "content-type": contentType },
        expiresAt: new Date(new Date(nowISO).getTime() + 10 * 60_000).toISOString(),
      };
    },
    async getDownloadUrl(key) {
      if (!objects.has(key)) throw new Error(`object not found: ${key}`);
      return `/dev-storage/${encodeURIComponent(key)}`;
    },
    async exists(key) { return objects.has(key); },
    async delete(key) { objects.delete(key); },
  };
}
