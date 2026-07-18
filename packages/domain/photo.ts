/* 사진 자산 상태 (#19 사전 코어) — 동의 게이트의 정본은 consent.ts
   (canSendPhotoAsset: 등장 원생 전원의 목적×대상 grants 재검증·차단 명단). */
export const PHOTO_ASSET_STATUS = ["PENDING_UPLOAD", "UPLOADED", "DELETED"] as const;
export type PhotoAssetStatus = (typeof PHOTO_ASSET_STATUS)[number];
