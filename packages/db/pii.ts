/* PII 저장 암호화 — docs/16 §D 설계의 구현.
   - encryptPii/decryptPii: AES-256-GCM (표시용 원문 복원 — 건강 메모·전화 표시)
   - hashPii: HMAC-SHA256 + pepper (동등성 매칭용 — OTP 결합·선등록 대조)
   키: PACEFOLIO_PII_KEY(hex 64자=32B) · PACEFOLIO_PII_PEPPER.
   프로덕션 미설정 = 부팅 실패(fail-closed) / dev = 고정 키 + 경고 1회.
   포맷: "v1:<iv hex>:<tag hex>:<cipher hex>" — keyId(v1) 로 키 회전 대비. */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const DEV_KEY = "3d8a1f6b2e9c4d7a5f0b8e1c6a3d9f2b7e4c1a8d5b2f9e6c3a0d7b4e1f8c5a2d";
const DEV_PEPPER = "pacefolio-dev-pepper";

let warned = false;
function keys(): { key: Buffer; pepper: string } {
  const isProd = process.env.NODE_ENV === "production";
  const rawKey = process.env.PACEFOLIO_PII_KEY;
  const pepper = process.env.PACEFOLIO_PII_PEPPER;
  if (isProd && (!rawKey || !pepper)) {
    // fail-closed: 키 없이 프로덕션에서 PII 를 다루지 않는다
    throw new Error("PACEFOLIO_PII_KEY / PACEFOLIO_PII_PEPPER 미설정 — 프로덕션 부팅 불가");
  }
  if (!isProd && (!rawKey || !pepper) && !warned) {
    warned = true;
    console.warn("[dev] PII 키 미설정 — 고정 dev 키 사용(프로덕션 금지)");
  }
  const hex = rawKey ?? DEV_KEY;
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("PACEFOLIO_PII_KEY 는 hex 64자(32바이트)여야 함");
  return { key: Buffer.from(hex, "hex"), pepper: pepper ?? DEV_PEPPER };
}

export function encryptPii(plain: string): string {
  const { key } = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptPii(stored: string): string {
  const [ver, ivHex, tagHex, encHex] = stored.split(":");
  if (ver !== "v1" || !ivHex || !tagHex || !encHex) throw new Error("PII 암호문 형식 오류");
  const { key } = keys();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
}

/** 동등성 매칭용 결정적 해시 — 전화번호는 정규화(숫자만) 후 해시할 것 */
export function hashPii(plain: string): string {
  const { pepper } = keys();
  return `v1:${createHmac("sha256", pepper).update(plain).digest("hex")}`;
}

/** 전화번호 정규화 + 해시 (선등록 대조·OTP 결합의 표준 경로) */
export function hashPhone(phone: string): string {
  return hashPii(phone.replace(/[^0-9]/g, ""));
}
