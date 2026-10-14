# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 2단계: 자료를 코드 밖으로 옮김

- 정적 파일(`data.json`)에 포함되어 있던 가상 메모를 Supabase `notes` 테이블로 분리했습니다.
- 프론트엔드 화면은 Vercel 서버리스 함수 `/api/notes`(`api/notes.js`)를 통해 Supabase 데이터를 조회하여 표시합니다.
- 서버 함수는 환경변수(`SUPABASE_URL`, `SUPABASE_SECRET_KEY`)를 통해 데이터베이스에 접근하며, 비밀키는 브라우저 파일, 응답 본문, 로그에 노출되지 않습니다.

### 현재 구조의 약점
- `/api/notes` 서버 함수가 **인증 없는 공개 주소**로 열려 있습니다.
- 따라서 정적 파일에서는 메모가 제거되었으나, 비로그인 상태의 누구라도 `/api/notes` 엔드포인트를 직접 호출하면 가상 메모 목록을 그대로 읽어갈 수 있는 취약점이 여전히 존재합니다. (다음 단계에서 사용자 인증 및 접근 제어 구현 필요)

### 가상 메모 문장 검색 확인 절차
최신 정적 배포 파일과 GitHub 최신 커밋 파일에서 가상 메모 문장("실습용 가상")이 남아있지 않은지 아래 절차로 확인합니다:

1. **GitHub 최신 커밋 파일 검색 (로컬 명령)**
   ```powershell
   git grep "실습용 가상" HEAD -- ':!schema.sql'
   ```
   - 정상 결과: `data.json`, `public/` 등 최신 소스 및 정적 파일에서 가상 메모 문장이 검색되지 않아야 합니다.
2. **배포된 정적 파일 접근 확인**
   ```powershell
   curl.exe -i https://<배포주소>/data.json
   ```
   - 정상 결과: `HTTP 404 Not Found` (정적 가상 메모 파일이 배포 산출물에 존재하지 않음).

### 과거 노출에 관한 주의점
- 최신 커밋 파일과 최신 배포에서 가상 메모를 제거했더라도, **GitHub의 이전 공개 커밋 이력과 Vercel의 이전 배포 본이 남아 있는 한 과거의 가상 메모 노출이 완전히 해소된 것은 아닙니다.**
- 이전 커밋 내역(`git log -p`)이나 이전 배포 링크를 조회하면 당시 공개되었던 가상 메모 문장이 여전히 확인될 수 있습니다.

### 2단계 현재 작동하는 기능
1. **자료 코드 분리**: 정적 파일(`data.json`)에서 가상 메모를 완전히 제거하고 Supabase `notes` 테이블로 분리 보관합니다.
2. **서버리스 조회 API**: Vercel의 `/api/notes`(`api/notes.js`)가 서버 환경변수를 통해 Supabase에 접속하여 가상 메모를 조회하고 프론트엔드에 전달합니다.
3. **정적 배포 보호**: 빌드 시 `public/data.json` 생성을 중단하여 배포된 `/data.json` 접근 시 404로 차단됩니다.

## 3단계: 진짜 로그인을 붙입니다

- Supabase Auth를 통해 실제 사용자 로그인/로그아웃 기능을 구현하고 토큰을 헤더에 첨부하여 API를 호출합니다.
- 서버 API(`/api/notes`)에서 JWT 토큰을 검증하여 비로그인 요청을 차단(HTTP 401)하고, 메모 생성 시 검증된 사용자 ID를 `owner_id`로 저장합니다.
- 가상 메모의 CRUD(GET, POST, PUT, DELETE) 엔드포인트를 구현하고 `aleph.config.json`의 `allowedRoutes`에 등록했습니다.

### 3단계 현재 작동하는 기능
1. **진짜 로그인 연동**: Supabase Auth를 통한 로그인/로그아웃 및 세션 토큰(JWT) 관리, 요청 시 Authorization Bearer 헤더 전달
2. **서버 측 로그인 검사**: `/api/notes` API에서 토큰 서명을 검증하며 비로그인 요청은 HTTP 401로 거부
3. **소유자 ID 저장 및 CRUD API**: 메모 추가 시 검증된 사용자 ID를 `owner_id`로 저장하며, 단건조회(GET /:id), 수정(PUT /:id), 삭제(DELETE /:id), 목록조회(GET /api/notes) 지원 및 `allowedRoutes` 등록

### 다시 실행하는 방법
1. **단위 시험 실행**:
   ```powershell
   npm run test:r5
   ```
2. **제출 묶음 생성 및 자기 점검**:
   ```powershell
   npm run bundle
   ```


## 4단계: 로그인해도 내 자료만 보이게 합니다

- 메모 API의 목록·단건 조회·추가·수정·삭제가 검증된 로그인 사용자 ID와 DB의 `owner_id`를 비교합니다. URL·본문의 `owner_id`는 믿지 않습니다.
- 학습 DB에서 초기 가상 메모 4건을 계정 A에, 공개 가능한 시험 메모 1건을 계정 B에 연결했습니다. (계정 이메일은 저장소에 적지 않습니다.)
- `notes` 테이블의 RLS·최소 권한 SQL(본인 행만 허용)은 Supabase SQL Editor에서 학생이 검토해 실행합니다. 서버 API는 서버 전용 키로 접속하므로 RLS가 아니라 API 코드의 소유자 검사가 A/B를 구분합니다.

### 4단계 현재 작동하는 기능
1. **내 메모만 조회**: 목록은 본인 메모만 반환하고, 다른 사람 메모 ID로 단건 조회하면 404입니다.
2. **추가 시 소유자 고정**: 새 메모는 검증된 사용자 ID로 저장하며, 본문에 다른 `owner_id`를 넣으면 403입니다.
3. **수정·삭제는 본인 것만**: 수정은 기존 행과 수정된 행의 소유자가 모두 본인일 때만 허용하고(응답 `{id,title,body}`, 본문 `{title,body}`), 소유자 변경 시도는 403, 다른 사람 메모의 수정·삭제는 404입니다.

### 다시 실행하는 방법 (4단계)
1. **단위 시험**: `npm run test:r5`
2. **제출 묶음과 자기 점검**: `npm run bundle`
   - 기본 실행은 비로그인 요청만 보내고, 로그인이 필요한 소유자 점검은 `미실행`으로 기록합니다.
   - 소유자 점검까지 하려면 같은 터미널에서만 `$env:ALEPH_CHECK_TOKEN_A`, `$env:ALEPH_CHECK_TOKEN_B`에 각 계정의 로그인 토큰을 넣고 실행합니다. 토큰은 파일·Git·제출 묶음에 넣지 않습니다.
3. **브라우저 수동 시험**: A로 로그인해 B 메모 ID로 GET·PUT·DELETE → 404, 내 메모의 `owner_id` 변경 → 403.

## 5단계: 자료 요청을 서버 한곳으로 모읍니다

- 브라우저 코드(`public/index.html`)는 메모 자료를 Supabase에 직접 요청하지 않고 서버 함수(`/api/notes`, `/api/notes/:id`)만 호출합니다. Supabase 클라이언트는 로그인(Auth)에만 씁니다.
- 학습 DB의 `notes` 테이블에서 `PUBLIC`·`anon`·`authenticated`의 직접 권한을 회수하는 SQL은 학생이 Supabase SQL Editor에서 검토해 실행합니다. 서버 함수는 서버 전용 키로 접속하므로 로그인·소유자 검사는 그대로 유지됩니다.
- `aleph.config.json`의 `originalApiUrl`에 쿼리 없는 원본 자료 주소(Supabase REST `notes`)를 적었습니다.

### 5단계 현재 작동하는 기능
1. **서버 한곳 경유**: 메모 읽기·추가·수정·삭제는 모두 서버 함수를 거치며, 로그인 검사(401)와 소유자 검사(상대 메모 404, 소유자 변경 403)가 적용됩니다.
2. **원본 직접 접근 차단(권한 SQL 적용 후)**: 공개 키(anon)나 로그인 토큰으로 원본 자료 API를 직접 요청하면 권한 없음(`42501`)으로 거부됩니다.

### 다시 실행하는 방법 (5단계)
1. **단위 시험**: `npm run test:r5`
2. **제출 묶음과 자기 점검**: `npm run bundle` — 4단계 점검에 더해 원본 자료 API를 공개 키로 직접 요청한 결과(`original_api_anon_read`)를 기록합니다.
3. **원본 직접 요청 수동 확인**: `curl.exe -i "<originalApiUrl>" -H "apikey: <public/index.html의 공개 키>"` → 거부(401/403, `42501`)가 정상입니다.

## 6단계: 등록한 기기만 자료실에 들어옵니다

- `src/decider.mjs`에 `device_registered` 규칙을 추가해, 요청의 `deviceRegistered`가 `true`일 때만 허용(`allow`)하고, `false`이거나 값이 없으면 `deny`·`device_not_registered`로 거부합니다 (`docs/DECIDER_REQUEST.md` 계약 기준).
- 기기 등록 확인 자체는 ALEPH SDP 엔진(반 엔진·릴레이)이 `decide()`를 부르기 전에 먼저 처리합니다. 학생 코드는 그 결과값(`deviceRegistered`)을 받아 판정하는 계약 함수만 구현하며, `api/notes.js` 등 서버 함수에 별도의 기기 등록 검사를 직접 만들어 넣지 않습니다(계약에 없는 `request.device`류 값을 지어내지 말라는 AGENTS.md 규칙과 같은 이유).

### 확인 순서 (6단계)
1. 이 확인에는 별도로 설치할 접속 프로그램이 없습니다. 저장소를 받은 뒤 `npm install`로 준비된 상태 그대로 실행합니다.
2. 실행:
   ```bash
   npm run decider:test
   ```
3. 정상 결과 (둘 다 `통과`여야 합니다):
   - `통과 · 등록 기기의 정상 요청` — `deviceRegistered: true` → `allow`
   - `통과 · 미등록 기기의 가상 요청` — `deviceRegistered: false` → `deny`, `reasonCode: device_not_registered`
4. 마지막 줄 "이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다"가 그대로 출력되는지 확인합니다 — 이 연습이 실제 심판 판정이 아니라는 뜻입니다.
5. 미등록 기기로 실제 자료실을 공격해 거부를 증명하는 일은 학생이 할 필요가 없습니다 — 심판이 맡아 확인합니다.

## 7단계: 평소와 다른 접속은 다시 확인합니다

- `src/decider.mjs`가 `signals`(지역·시각·네트워크)와 `recentEvents`(행동 이력)의 모양과 출처(`none`·`judge_fixture`만 인정)를 엄격히 검사합니다. 값이 없거나 모양이 다르면 `local`·`usual` 같은 정상값으로 채우지 않고 `deny`·`signals_not_verified`로 거부합니다.
- 평소와 다른 시각(22시~06시)과 처음 보는 네트워크(`unusual`)에서 짧은 시간 안에 많은 자료를 읽은 사건이 함께 나타나는 복합 이상 접속만 `step_up`·`step_up_required`(다시 확인 요청)로 판정합니다. 지역(`region`) 값 하나만으로는 판정하지 않습니다.
- 이미 신선한 재인증(`stepUp.verified: true`, `authAgeSeconds` 0~900초)이 함께 오면 같은 복합 이상 접속도 `allow`로 넘어가되, 사유(`step_up_required`)를 `ruleIds`에 남깁니다.
- 실제 재로그인 확인(배포된 `/api/notes`에 적용)은 아직 하지 않았습니다. 이 판정기는 로컬 연습으로만 확인되며, 반 엔진이 이 값들을 실제로 검증해 보내는 경로가 확인돼야 실측할 수 있습니다.

### 확인 순서 (7단계)
1. 별도로 설치할 접속 프로그램은 없습니다.
2. 실행:
   ```bash
   npm run decider:test
   ```
3. 정상 결과 (네 개 모두 `통과`):
   - `통과 · 등록 기기의 정상 요청`
   - `통과 · 미등록 기기의 가상 요청`
   - `통과 · 복합 이상 접속` — 이상 조합 → `step_up`·`step_up_required`
   - `통과 · 다시 확인한 복합 이상 접속` — 신선한 재인증 뒤 → `allow`
4. 참고 연습:
   ```bash
   npm run fixture:7
   ```
   → `정상 사건: allow`, `복합 이상 사건: step_up`
5. 미등록 기기·위조 접속 신호로 실제 자료실을 공격해 거부를 증명하는 일은 학생이 할 필요가 없습니다 — 심판이 맡아 확인합니다.

## 8단계: 자료마다 갈 수 있는 구역을 나눕니다

- `src/decider.mjs`가 `request.route`를 정확히(부분일치 없이) 알려진 경로 목록과 대조해 조회 구역(메모 단건 `GET /notes/:id`, 공지 `GET /announcements`)과 쓰기 구역(`POST`/`PUT`/`DELETE`)으로 나누고, `route`뿐 아니라 `service`도 함께 대조해 route 모양만 맞고 실제 service가 다른 자원을 가리키는 "구역이 섞인" 요청을 거부하며, 기기 ID·주체 ID의 모양도 함께 검사합니다. 목록에 없는 경로는 `deny`·`route_not_allowlisted`로 거부합니다.
- 메모 **전체 목록**(`GET /notes`, `:id` 없음)은 구역 목록에 일부러 넣지 않았습니다 — 판정기는 자원 한 건의 소유자를 알 방법이 없어서, 여러 사람의 자료를 한꺼번에 여는 모양의 경로는 애초에 허용하지 않습니다. 단건 조회만 API의 소유자 검사와 함께 허용합니다.
- 쓰기 구역은 조회 구역보다 낮은 이상 신호 문턱(3개 중 2개만 겹쳐도)에서 재확인(`step_up`·`write_zone_step_up_required`)을 요구합니다. 조회 구역은 7단계와 동일하게 3개 모두 겹쳐야 합니다.
- 메모(`notes`)와 다른 자원인 **강사 공지**를 별도 경로·테이블(`GET /api/announcements`, `announcements` 테이블)로 분리했습니다. 소유자가 없는 공용 읽기 자료이며, `route`·`service` 값(`GET /announcements` vs `GET /notes/:id`)으로 서버가 두 자원을 구별합니다.
- 자료 API(`/api/notes`, `/api/announcements`) 모두에서, 화면 메뉴나 요청 본문·쿼리의 `role`(강사 등 권한 주장)을 신뢰하지 않고 `403`·`ROLE_NOT_TRUSTED`로 거부합니다. 메모 목록 조회는 DB 쿼리의 소유자 필터만 믿지 않고 반환 직전 각 행의 소유자를 한 번 더 대조합니다.

### 확인 순서 (8단계)
1. 별도로 설치할 접속 프로그램은 없습니다.
2. 실행:
   ```bash
   npm run decider:test
   ```
3. 정상 결과 (아홉 개 모두 `통과`): 6·7단계 점검 네 개에 더해
   - `통과 · 등록되지 않은 경로` — 목록에 없는 `route` → `deny`·`route_not_allowlisted`
   - `통과 · 구역이 섞인 요청(route는 메모, service는 공지)` — route는 맞아도 service가 다르면 → `deny`·`route_not_allowlisted`
   - `통과 · 메모 전체 목록 경로(여러 사람의 자료를 한꺼번에 여는 모양)` — `GET /notes`(목록) → `deny`·`route_not_allowlisted`
   - `통과 · 쓰기 구역의 약한 이상 접속` — 신호 2개만 겹쳐도 → `step_up`·`write_zone_step_up_required`
   - `통과 · 다시 확인한 쓰기 구역 접속` — 신선한 재인증 뒤 → `allow`
4. 참고 연습: `npm run fixture:7` → `정상 사건: allow`, `복합 이상 사건: step_up` (조회 구역 동작 불변 확인)
5. 자료 API의 role 미신뢰·소유자 재대조는 배포된 주소에서 직접 확인합니다(로컬 자동 시험 없음):
   ```bash
   curl.exe -i -X PUT "<publicAppUrl>/api/notes/<내 메모 id>" -H "Authorization: Bearer <내 토큰>" -H "Content-Type: application/json" -d "{\"title\":\"t\",\"body\":\"b\",\"role\":\"instructor\"}"
   curl.exe -i "<publicAppUrl>/api/announcements?role=instructor" -H "Authorization: Bearer <내 토큰>"
   ```
   정상 결과: 둘 다 `403`, `{"error":"ROLE_NOT_TRUSTED"}`.
6. Supabase SQL Editor에서 `schema.sql`의 8단계 부분(`announcements` 테이블 생성·RLS·실습용 가상 공지 1건)을 미리 실행해 둬야 5번이 동작합니다.

## 9단계: 도플갱어를 찾고 권한을 거둡니다

- `src/detect.mjs`의 `detect(events)`가 `docs/DETECT_EVENTS.md` 계약의 세 값(가명 사용자 `identity.sub`, 요청 종류 `method`, 시각 `at`)만 엄격히 읽습니다. 모양이 다르거나 메모 내용·토큰·실명 같은 값이 섞인 사건은 통째로 거부합니다(값을 추측해 채우지 않음).
- 같은 가명 사용자의 `GET` 사건이 어느 10분 구간에서든 **120건을 넘을 때만** `{ action: 'propose_revocation', reasonCode: 'burst_read', subject: 그 사용자 }`를 돌려줍니다. 정확히 120건은 대상이 아니고, 다른 사용자 사건을 합치거나 10분 밖 사건을 같은 구간으로 세지 않습니다. 대상은 한 번에 하나만 담습니다. 실제 회수 집행·시각은 심판이 처리하며, 이 함수는 제안만 돌려줍니다(회수 API 직접 호출 없음).
- `src/decider.mjs`에 `network_burst_suspected` 규칙을 추가했습니다 — 처음 보는 네트워크(`unusual`)와 갑작스러운 다량 조회(5분 이내 10건 이상)가 **함께** 나타날 때만 `step_up`으로 재확인을 요구합니다. 시각은 보지 않고, 지역(`region`) 하나만으로는 판단하지 않습니다. 기존 "조회 3/3·쓰기 2/3" 구역 문턱 규칙은 그대로 유지하며, 이 규칙은 그걸로 안 걸리는 경우까지 추가로 잡습니다. `decide()`의 접속 허용/거부 응답 형식(5개 항목)은 바꾸지 않았습니다.

### 확인 순서 (9단계)
1. 별도로 설치할 접속 프로그램은 없습니다.
2. 탐지 함수 실행:
   ```bash
   npm run detect:test
   ```
   정상 결과 (여섯 개 모두 `통과`): 30건·120건·서로 다른 사용자·10분 밖 흩어진 사건은 `observe`, 121건·폭주 200건은 `propose_revocation`·`burst_read`.
3. 판정기 실행:
   ```bash
   npm run decider:test
   ```
   정상 결과 (열한 개 모두 `통과`): 8단계 점검 아홉 개에 더해
   - `통과 · 네트워크+다량 조회 복합 의심(시각은 정상)` — `step_up`·`network_burst_suspected`
   - `통과 · 네트워크만 다른 정상 사건` — `allow`
4. 참고 연습: `npm run fixture:7` → `정상 사건: allow`, `복합 이상 사건: step_up` (기존 동작 불변 확인)
5. 둘 다 가상 요청으로 하는 로컬 연습입니다 — 실제 접속 회수나 심판 판정으로 보고하지 않습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

