/* 공용 숫자·금액 포맷 (#2) — 앱별 _data.ts 사본을 한 곳으로.
   출력 계약(기존 화면과 동일): fmt=천단위 / won="1,000원" / fmtWon="₩1,000" */
export const fmt = (n: number) => n.toLocaleString("ko-KR");
export const won = (n: number) => `${fmt(n)}원`;
export const fmtWon = (n: number) => `₩${fmt(n)}`;
