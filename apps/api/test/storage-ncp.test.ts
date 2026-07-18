/* NCP Object Storage 어댑터 — presign 계약 유닛 테스트(네트워크 불요, 서명은 오프라인) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createNcpObjectStorage, ncpStorageFromEnv } from "../src/storage/ncp";

const cfg = {
  endpoint: "https://kr.object.ncloudstorage.com",
  region: "kr-standard",
  bucket: "pacefolio-photos",
  accessKeyId: "TESTKEY",
  secretAccessKey: "TESTSECRET",
};
const NOW = "2026-07-19T12:00:00.000Z";

test("업로드 타깃: presigned PUT — 버킷·키·서명·만료 파라미터 포함", async () => {
  const st = createNcpObjectStorage(cfg);
  const t = await st.createUploadTarget("academies/a_x/photos/ph_1", "image/jpeg", NOW);
  assert.equal(t.method, "PUT");
  const u = new URL(t.url);
  assert.equal(u.origin, cfg.endpoint);
  assert.ok(u.pathname.startsWith(`/${cfg.bucket}/academies/a_x/photos/ph_1`)); // path-style
  assert.ok(u.searchParams.get("X-Amz-Signature")); // SigV4 서명
  assert.equal(u.searchParams.get("X-Amz-Expires"), "600");
  assert.equal(t.headers["content-type"], "image/jpeg");
  assert.equal(t.expiresAt, "2026-07-19T12:10:00.000Z");
});

test("다운로드 URL: presigned GET — TTL 반영", async () => {
  const st = createNcpObjectStorage(cfg);
  const url = await st.getDownloadUrl("academies/a_x/photos/ph_1", 300, NOW);
  const u = new URL(url);
  assert.equal(u.searchParams.get("X-Amz-Expires"), "300");
  assert.ok(u.searchParams.get("X-Amz-Signature"));
});

test("env 선택: 4개 미충족 = null(호출부 fail-closed) · 충족 = NCP 어댑터", () => {
  const env = process.env as Record<string, string | undefined>;
  const keys = ["PACEFOLIO_STORAGE_ENDPOINT", "PACEFOLIO_STORAGE_BUCKET",
    "PACEFOLIO_STORAGE_ACCESS_KEY", "PACEFOLIO_STORAGE_SECRET_KEY"] as const;
  const saved = keys.map((k) => env[k]);
  try {
    keys.forEach((k) => delete env[k]);
    assert.equal(ncpStorageFromEnv(), null);
    env.PACEFOLIO_STORAGE_ENDPOINT = cfg.endpoint;
    env.PACEFOLIO_STORAGE_BUCKET = cfg.bucket;
    env.PACEFOLIO_STORAGE_ACCESS_KEY = cfg.accessKeyId;
    assert.equal(ncpStorageFromEnv(), null); // 3/4 — 부분 설정도 거부
    env.PACEFOLIO_STORAGE_SECRET_KEY = cfg.secretAccessKey;
    assert.equal(ncpStorageFromEnv()?.name, "ncp-object-storage");
  } finally {
    keys.forEach((k, i) => { if (saved[i] === undefined) delete env[k]; else env[k] = saved[i]; });
  }
});
