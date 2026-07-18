# 파일럿 배포 체크리스트 — NCP (인프라 결정 2026-07-19)

> 결정: NCP 같은 계정에 **전용 VM + Cloud DB for PostgreSQL + Object Storage**,
> 도메인 **pacefolio.co.kr**(구매 완료·DNS 미설정). 크롤러 VM(3.8GB)과는 분리 —
> 크롬 워커 병목·격리(아동 개인정보+결제). 월 비용 감: 8~11만.
> 노출 방식은 크롤러에서 검증된 **cloudflared 터널** 재사용(공개 포트 0).

## A. TJ — NCP 콘솔에서 (순서대로)

### 1. Object Storage (10분)
1. 콘솔 → Object Storage → 버킷 생성: `pacefolio-photos` (kr 리전, 비공개)
2. 마이페이지 → 인증키 관리 → **API 인증키 생성** (Access Key / Secret Key — 어디 적어두지 말고 서버 .env 에만)
3. 서버 .env 에 들어갈 값 4개:
   ```
   PACEFOLIO_STORAGE_ENDPOINT=https://kr.object.ncloudstorage.com
   PACEFOLIO_STORAGE_REGION=kr-standard
   PACEFOLIO_STORAGE_BUCKET=pacefolio-photos
   PACEFOLIO_STORAGE_ACCESS_KEY=...   # 위에서 발급
   PACEFOLIO_STORAGE_SECRET_KEY=...
   ```
   → 이 4개가 설정되면 API 가 자동으로 NCP 어댑터를 사용(`src/storage/ncp.ts`).
   미설정 시 프로덕션은 사진 라우트 501(fail-closed) — 침묵 저장 없음.

### 2. Cloud DB for PostgreSQL (20분)
1. 콘솔 → Cloud DB for PostgreSQL → 최소 스펙 생성(자동 백업 켜기 — 기본값 유지)
2. DB 명 `pacefolio`, 계정 생성 → 접속 정보로:
   ```
   DATABASE_URL=postgres://{계정}:{암호}@{호스트}:5432/pacefolio
   ```
3. ACG(방화벽): **PACEFOLIO VM 의 사설 IP 만 5432 허용** (공인망 개방 금지)

### 3. 전용 VM (20분)
1. 콘솔 → Server → Ubuntu 22.04/24.04, **2vCPU/4GB**, 디스크 50GB (크롬 안 돌리므로 충분)
2. 크롤러 서버 만들 때와 동일: 인증키(pem) 보관, ACG 는 SSH(22)만 — 웹 포트는 안 엶(터널)
3. 접속 후 기본 세팅: Node 20 설치(`nvm` 또는 NodeSource), git, appuser 계정
   (크롤러의 DEPLOY_CLOUD.md 흐름과 동일 — python 대신 Node)

### 4. 도메인 + 터널 (15분)
1. Cloudflare 에 `pacefolio.co.kr` 사이트 추가 → 등록대행(가비아 등)에서 네임서버를 Cloudflare 로 변경
2. VM 에 cloudflared 설치(크롤러와 같은 방식) → 터널 2개 라우트:
   - `app.pacefolio.co.kr` → localhost:3000 (웹)
   - (API 는 웹 rewrite 프록시 경유 — 별도 노출 불필요)
3. 인증서·HTTPS 는 Cloudflare 가 자동

## B. 서버에서 — 앱 배포 (제가 스크립트로 도울 수 있음)

```bash
git clone <wondergym-app 저장소> /opt/pacefolio && cd /opt/pacefolio/pacefolio-app
npm ci && npm run build
# .env (apps/api 실행 환경): DATABASE_URL + 스토리지 4개 +
#   NODE_ENV=production · PACEFOLIO_ALLOWED_ORIGINS=https://app.pacefolio.co.kr
#   NEXT_PUBLIC_PACEFOLIO_REQUIRE_SESSION=1  (proxy 역할 검증 켜기)
#   PACEFOLIO_PII_KEY / PACEFOLIO_PII_PEPPER  (hex64 랜덤 — 미설정 시 부팅 실패가 정상)
npx drizzle-kit migrate   # packages/db — DATABASE_URL 대상 스키마 적용
# systemd 2개: pacefolio-api(:3001) + pacefolio-web(next start :3000) — 크롤러 .service 패턴 복제
```

## C. 배포 후 확인 (스모크)
1. `https://app.pacefolio.co.kr` — 로그인 게이트(REQUIRE_SESSION) 동작, fixture 화면 없음
2. 사진 업로드 → NCP 버킷에 객체 생성 확인 → finalize 동의 게이트 422/200
3. 결제는 파일럿 정책대로 **모의(PG_SIMULATION) 또는 오프라인 수납만** — 실 PG 는 법률 체크 후
4. outbox 디스패처 로그(15초 주기) + 안전사고 → 원장 인앱 알림

## 미결(파일럿 전 별도 트랙)
- 실 카카오 로그인(키 발급) — 파일럿은 dev 로그인 비활성 + 초대 기반 온보딩 설계 필요 ⚠️
  (프로덕션은 devLogin 404 — 실 로그인 없으면 진입 불가. 카카오 키가 파일럿 하드 블로커)
- 법률 체크(환불 수치) — 실 결제 전 필수(헌법)
- 알림톡/SMS 사업자 — 인앱 알림만으로 파일럿 시작 가능
