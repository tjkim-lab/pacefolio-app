/* 멀티역할 모델 A + 권한 합집합 (리뷰 R2 6.3) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import type { AcademyMembership } from "../entities";
import { rolesInAcademy, hasRoleInAcademy, academyIdsForUser } from "../membership";
import { canAny, capabilitiesForRoles } from "../permissions";

const U = asId<AcademyMembership["userId"]>("u_1");
const ACA = asId<AcademyMembership["academyId"]>("aca_1");
const ACB = asId<AcademyMembership["academyId"]>("aca_2");

const ms: AcademyMembership[] = [
  { id: asId("m1"), userId: U, academyId: ACA, roles: ["OWNER", "COACH"], status: "ACTIVE", joinedAt: "2024-01-01" },
  { id: asId("m2"), userId: U, academyId: ACB, roles: ["COACH"], status: "ENDED", joinedAt: "2023-01-01" },
];

test("원장이면서 코치: rolesInAcademy 가 둘 다 반환", () => {
  assert.deepEqual(rolesInAcademy(ms, U, ACA).sort(), ["COACH", "OWNER"]);
  assert.ok(hasRoleInAcademy(ms, U, ACA, "OWNER"));
  assert.ok(hasRoleInAcademy(ms, U, ACA, "COACH"));
});

test("ENDED 멤버십은 ACTIVE 학원집합·역할에서 제외", () => {
  assert.deepEqual(academyIdsForUser(ms, U), [ACA]);
  assert.deepEqual(rolesInAcademy(ms, U, ACB), []);
});

test("권한 합집합: 원장+코치 → 청구관리(원장) + 실출결기록(코치) 둘 다", () => {
  const roles = rolesInAcademy(ms, U, ACA);
  assert.ok(canAny(roles, "MANAGE_BILLING"));    // OWNER 능력
  assert.ok(canAny(roles, "RECORD_ATTENDANCE")); // COACH 능력
  const caps = capabilitiesForRoles(roles);
  assert.ok(caps.includes("MANAGE_BILLING") && caps.includes("RECORD_ATTENDANCE"));
});

test("코치 단독은 결제금액 조회 불가(리뷰 6-3)", () => {
  assert.equal(canAny(["COACH"], "VIEW_PAYMENT_AMOUNT"), false);
});
