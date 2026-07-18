/* PII 암호화 모듈 — docs/16 §D. 왕복·변조 감지·해시 결정성·프로덕션 fail-closed */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptPii, decryptPii, hashPii, hashPhone } from "../src/crypto-pii";

test("AES-GCM 왕복 + 매 암호화마다 다른 IV(같은 평문 ≠ 같은 암호문)", () => {
  const a = encryptPii("010-3000-1234");
  const b = encryptPii("010-3000-1234");
  assert.notEqual(a, b);                       // 확률적 암호화
  assert.match(a, /^v1:/);                     // keyId — 회전 대비
  assert.equal(decryptPii(a), "010-3000-1234");
  assert.equal(decryptPii(b), "010-3000-1234");
});

test("GCM 변조 감지 — 암호문 1바이트 변조 시 복호화 실패", () => {
  const enc = encryptPii("알레르기: 견과류");
  const parts = enc.split(":");
  const tampered = parts.slice(0, 3).join(":") + ":" +
    (parts[3][0] === "0" ? "1" : "0") + parts[3].slice(1);
  assert.throws(() => decryptPii(tampered));
});

test("hashPii 결정성 + hashPhone 정규화(형식 달라도 같은 해시)", () => {
  assert.equal(hashPii("x"), hashPii("x"));            // 매칭 가능
  assert.notEqual(hashPii("x"), hashPii("y"));
  assert.equal(hashPhone("010-3000-1234"), hashPhone("01030001234"));
  assert.equal(hashPhone("010 3000 1234"), hashPhone("010-3000-1234"));
  assert.notEqual(hashPhone("010-3000-1234"), "01030001234"); // 원문 아님
});

test("프로덕션 키 미설정 = fail-closed(부팅·사용 불가)", () => {
  const env = process.env as Record<string, string | undefined>;
  const prev = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    assert.throws(() => encryptPii("x"), /미설정/);
    assert.throws(() => hashPii("x"), /미설정/);
  } finally {
    env.NODE_ENV = prev;
  }
});
