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

## 10단계: 백업에서 자료실을 되살립니다

- `src/decider.mjs`의 `ZONE_BY_ROUTE`에 `POST /notes/:id/restore`(서비스 `notes`, 쓰기 구역)를 등록하고, `aleph.config.json`의 `allowedRoutes`에 실제 배포 경로 `POST /api/notes/:id/restore`를 추가했습니다. 다른 쓰기(추가·수정·삭제)와 같은 쓰기 구역 재확인 문턱을 씁니다.
- **정책 비교·복원** (`scripts/restore-check.mjs`, `scripts/restore-apply.mjs`): 침해 전에 검증한 안전 정책 사본(`docs/policy-backup/policy.json`+ `policy.sha256`)과 현재 `aleph.config.json`의 `allowedRoutes`·`src/decider.mjs`의 `RULE_IDS`를 대조해 차이만 보여줍니다. 사본이 없거나 지문이 사본 내용과 다르면 어떤 차이도 보여주지 않고 중단합니다. 실제 적용(`restore:apply`)은 표시된 백업 버전을 `--confirm-version`으로 다시 넣어야만 진행되며, `allowedRoutes`만 되돌리고 다른 설정 필드·코드는 그대로 둡니다. 결과는 `docs/policy-backup/audit-log.jsonl`에 추가만 됩니다(기존 줄 보존).
- **메모 한 건 복원** — 서비스 `notes`, 경로 `POST /api/notes/:id/restore`: 비공개 백업 테이블 `notes_backup`에서 그 id의 사본만 찾아, 사본의 소유자가 요청자 본인과 같고 내용 지문(`content_sha256`)이 사본 내용과 일치할 때만 `notes` 테이블의 그 행 하나만 되돌립니다(`src/note-restore.mjs`). 다른 메모 행은 건드리지 않고, 성공·중단 모두 `restore_audit` 테이블에 한 줄만 추가합니다. 요청 본문의 제목·내용은 읽지 않습니다 — 복원되는 내용은 오직 검증된 백업에서만 옵니다.

### 10단계 현재 작동하는 기능
1. **정책 비교·거부**: 백업 사본이 없거나 지문이 안 맞으면 `restore:check`·`restore:apply` 모두 차이를 보여주지 않고 중단합니다.
2. **정책 복원 확인 절차**: `restore:apply`는 `restore:check`로 본 백업 버전을 그대로 다시 넣을 때만 `allowedRoutes`를 되돌리며, 그 외 설정과 코드는 보존합니다.
3. **메모 한 건 복원과 감사 기록**: `POST /api/notes/:id/restore`는 ID·소유자·내용 지문이 모두 사본과 같을 때만 그 메모 한 건을 되돌리고, 다른 메모와 기존 감사 기록은 보존합니다.

### 확인 순서 (10단계)
1. 단위 시험 실행:
   ```bash
   npm run test:restore
   npm run test:note-restore
   ```
   정상 결과: 둘 다 모두 통과(`pass`).
2. 정책 비교(지금은 진짜 백업이 없는 상태이므로 거부가 정상 결과입니다):
   ```bash
   npm run restore:check
   ```
   정상 결과: `중단 · 검증된 정책 백업 사본(docs/policy-backup/policy.json)이 없습니다.`
3. Supabase SQL Editor에서 `schema.sql`의 10단계 부분(`notes_backup`, `restore_audit` 테이블 생성)을 먼저 실행해야 메모 복원 경로가 동작합니다.
4. 메모 복원은 배포된 주소에서 시험 계정 B의 메모로만 확인합니다(계정 이메일은 저장소에 적지 않습니다):
   - B로 로그인한 뒤, B의 메모 사본 한 건을 `notes_backup`에 미리 넣어 둡니다(실습용 가상 내용만, `content_sha256`은 `title`·`content`의 SHA-256 지문).
   - 복원된 한 건의 ID·소유자·내용 해시를 백업 사본의 값과 각각 비교합니다. 세 값이 모두 같아야 합니다. 그 세 값이 사본과 같을 때만 그 한 건을 복원합니다. 다른 메모는 그대로 둡니다.
   - 정상 결과: `curl.exe -i -X POST "<publicAppUrl>/api/notes/<그 메모 id>/restore" -H "Authorization: Bearer <B의 토큰>"` → 200, 응답 본문의 제목·내용이 백업 사본과 같음. 복원된 메모의 ID·소유자·내용 해시가 사본과 같아야 합니다.
   - 거부돼야 할 결과: 백업이 없는 id로 같은 요청 → 404 `BACKUP_NOT_FOUND`(존재 여부를 알리지 않음). 이 복원 뒤에도 B의 다른 메모 조회·수정은 그대로 동작해야 합니다.

### 복구 뒤 1~9단계 재확인 순서

정책 복원(`restore:apply`)이나 메모 복원(`POST /api/notes/:id/restore`)을 실제로 적용한 뒤에는, 자료·정책이 돌아왔는지와 이전에 막던 요청이 다시 거부되는지를 아래 순서로 1~9단계 것부터 다시 확인합니다. 상태는 실제로 그 항목을 실행했을 때만 `통과`/`실패`로 바꾸고, 아직 실행하지 않은 항목은 `미실행`으로 남겨 둡니다 — 실행하지 않은 결과를 통과로 적지 않습니다. (1단계는 최초 배포 확인이라 복구 후 재확인 대상에서 제외합니다.)

- **10단계 — 메모 복원 검증** (상태: 미실행)
  - 복원 실행 후, 복원된 한 건의 ID·소유자·내용 해시를 백업 사본의 값과 각각 비교합니다.
  - 세 값이 모두 같아야 합니다. 그 세 값이 사본과 같을 때만 그 한 건을 복원합니다. 다른 메모는 그대로 둡니다.

1. **2단계 — 가상 메모 노출 차단** (상태: 미실행)
   ```powershell
   git grep "실습용 가상" HEAD -- ':!schema.sql'
   curl.exe -i https://<배포주소>/data.json
   ```
   정상 결과: 첫 명령은 아무것도 찾지 못함, 둘째 명령은 `HTTP 404 Not Found`.
2. **3~4단계 — 로그인과 소유자 분리** (상태: 미실행)
   ```bash
   npm run test:r5
   ```
   + 브라우저 수동 시험: A로 로그인해 B 메모 ID로 GET·PUT·DELETE.
   정상 결과: `test:r5` 통과. 거부돼야 할 결과: B 메모 접근 → 404, 내 메모의 `owner_id` 변경 시도 → 403.
3. **5단계 — 원본 자료 직접 접근 차단** (상태: 미실행)
   ```bash
   curl.exe -i "<originalApiUrl>" -H "apikey: <public/index.html의 공개 키>"
   ```
   거부돼야 할 결과: 401/403, `42501`.
4. **6~7단계 — 기기 등록과 접속 신호 판정** (상태: 미실행)
   ```bash
   npm run decider:test
   npm run fixture:7
   ```
   정상 결과: `decider:test` 네 개 모두 통과(등록 기기 `allow`, 미등록 기기 `deny`, 복합 이상 접속 `step_up`, 재인증 뒤 `allow`). `fixture:7`: 정상 사건 `allow`, 복합 이상 사건 `step_up`.
5. **8단계 — 구역·role 분리** (상태: 미실행)
   ```bash
   npm run decider:test
   curl.exe -i -X PUT "<publicAppUrl>/api/notes/<내 메모 id>" -H "Authorization: Bearer <내 토큰>" -H "Content-Type: application/json" -d "{\"title\":\"t\",\"body\":\"b\",\"role\":\"instructor\"}"
   curl.exe -i "<publicAppUrl>/api/announcements?role=instructor" -H "Authorization: Bearer <내 토큰>"
   ```
   정상 결과: `decider:test` 아홉 개 모두 통과. 거부돼야 할 결과: curl 두 개 모두 `403`, `{"error":"ROLE_NOT_TRUSTED"}`.
6. **9단계 — 도플갱어 탐지와 접속 재확인** (상태: 미실행)
   ```bash
   npm run detect:test
   npm run decider:test
   ```
   정상 결과: `detect:test` 여섯 개 모두 통과(폭주 조회만 `propose_revocation`·`burst_read`). `decider:test` 열한 개 모두 통과(네트워크+다량조회 복합 → `step_up`, 네트워크만 다른 정상 사건 → `allow`).

위 1~6번이 전부 `통과`로 바뀌어야 "자료와 정책이 돌아오고 이전에 막던 요청이 다시 거부된다"를 확인한 것입니다. 지금은 전부 `미실행` 상태입니다.

## 11단계: 설치형 웹앱과 기기 승인 게이트

- `public/manifest.json`·`public/icon.svg`로 설치형 웹앱(이름·아이콘·오프라인 안내)을 열 수 있게 했습니다. 화면의 "앱 설치 상태"는 독립 실행 모드 여부만 보여주며, 설치 여부와 기기 확인은 서로 다른 값임을 문구로 분리해 둡니다.
- 새 테이블 `device_approvals`(`schema.sql`)에 계정별 승인 여부(`approved`)만 둡니다. 기기별 개인키는 어디에도 만들거나 저장하지 않고, 로그인한 계정으로의 접속 전체를 하나의 승인 단위로 다룹니다.
- `GET/POST /api/devices`(`api/devices.js`, `src/device-approval.mjs`)로 승인 상태를 확인하거나 승인을 요청합니다. `POST`는 대기 행만 만들 뿐 스스로 `approved`를 `true`로 바꾸지 않습니다 — 실제 승인은 Supabase 테이블에서 운영자가 직접 처리합니다.
- `api/notes.js`가 응답 전에 같은 승인 여부를 다시 확인해, 승인되지 않은 계정은 로그인했어도 `403 DEVICE_NOT_APPROVED`로 거부합니다. 화면(`public/index.html`)도 승인 전에는 메모 폼·목록을 비우고 `/api/notes`를 아예 호출하지 않으며, "기기 접속 상태" 문구는 승인 상태 확인 결과와 이후 실제 메모 조회 결과를 그대로 반영합니다 — 승인 버튼 클릭만으로 화면이 열리지 않습니다.
- 브라우저용 Supabase 클라이언트가 기본값(`persistSession`)으로 로그인 접속 토큰(refresh token 포함)을 `localStorage`에 남기고 있었습니다. 이 토큰도 "브라우저에 둔 기기 키"와 같은 문제라 `persistSession`·`autoRefreshToken`·`detectSessionInUrl`을 모두 끄고, 이전에 남아 있을 수 있는 `sb-*-auth-token` 값도 화면을 열 때 지웁니다. 그 결과 로그인은 매 접속마다 새로 합니다.

### 확인 순서 (11단계)
1. Supabase SQL 편집기에서 `schema.sql`의 11단계 부분(`device_approvals` 테이블 생성)을 먼저 실행합니다.
2. 단위 시험 실행:
   ```bash
   npm run test:device-approval
   ```
   정상 결과: 6개 모두 통과(`pass`).
3. 배포 사이트에서 로그인 → 승인 전: "기기 승인 필요" 블록만 보이고 메모 목록·추가 폼은 비어 있어야 합니다(정상 결과: 승인 전 자료 없음).
4. "기기 승인 요청" 클릭 → "승인 대기 중"으로 바뀌는지 확인합니다(거부돼야 할 결과: 이 클릭만으로 메모 목록이 열리면 문제입니다).
5. Supabase 테이블 편집기에서 `device_approvals`의 내 `owner_id` 행 `approved`를 `true`로 바꾼 뒤, 화면에서 "승인 상태 다시 확인"을 클릭합니다. 정상 결과: "기기 접속 상태: 등록 기기로 확인됨" → 이어서 메모 목록이 기존처럼 정상 표시됩니다.
6. 거부 확인(승인 전 상태에서): `curl.exe -i "<publicAppUrl>/api/notes" -H "Authorization: Bearer <내 토큰>"` → 거부돼야 할 결과: `403 {"error":"DEVICE_NOT_APPROVED"}`.
7. 브라우저 저장소 확인: 로그인한 뒤 개발자 도구 → Application/저장소 탭에서 `localStorage`를 봅니다. 정상 결과: `sb-...-auth-token` 같은 항목이 생기지 않고, 새로고침하면 로그인 화면으로 돌아갑니다. 거부돼야 할 결과: 새로고침 뒤 로그인 없이 바로 기존 화면이 열림(토큰이 저장소에 남아있다는 뜻).

## 12단계: 탈환 작전실과 41종 연습 재현표

- **탈환 작전실** (`GET /api/ops-summary`, `src/ops-summary.mjs`, 화면의 "탈환 작전실" 패널): 로그인한 계정에게 판정기 규칙·탐지 사건·회수 상태·복구 기록 네 가지를 보여줍니다. 판정기(`decider.mjs`)·탐지(`detect.mjs`)·회수 상태는 코드에 구현됐을 뿐 이 배포의 실제 트래픽과 연결되지 않아 항상 `verified: "not_live"`로 표시합니다. 복구 기록(적용/중단 건수)만 `notes_backup`→`restore_audit`를 실제로 조회해 `verified: "confirmed"`로 표시하며, 메모 제목·내용은 어디서도 읽지 않습니다.
- **1~11단계 연습 재현표** (`scripts/recon-table.mjs`, `npm run recon:table`): `decider:test`(11)+`detect:test`(6)+`fixture:7`(2)+`test:r5`(2)+`test:restore`(10)+`test:note-restore`(4)+`test:device-approval`(6) = 41건을 지금 다시 실행해 단계·정상/금지·기대결과·실제결과·요청ID·확인시각 표를 만듭니다. 실행하지 않은 항목을 통과로 적지 않으며, 이 41건은 전부 로컬에서 바로 돌 수 있어 끝까지 실행되면 미실행이 0이어야 합니다.

### 확인 순서 (12단계)
1. 단위 시험 실행:
   ```bash
   npm run test:ops-summary
   ```
   정상 결과: 4개 모두 통과.
2. 41종 재현표 실행:
   ```bash
   node scripts/recon-table.mjs
   ```
   정상 결과: 마지막 줄에 `총 41건 실행 (기대 41건) · 실패 0 · 미실행 0`.
3. 거부 확인(비로그인): `curl.exe -i "<publicAppUrl>/api/ops-summary"` → 거부돼야 할 결과: `401 UNAUTHORIZED`.
4. 배포 사이트에서 로그인 → "탈환 작전실" 패널 확인. 정상 결과: 판정기 규칙·탐지 사건·회수 상태는 "미실행(가상 연습)", 아직 복구해 본 적이 없으면 복구 항목은 "확인됨 (실제 서버 기록) · 적용 0건 · 중단 0건".
5. 토큰이 있으면(`$env:ALEPH_CHECK_TOKEN_A`/`_B`) `node scripts/bundle.mjs`로 `own_notes_read`·`device_not_approved` 등 실제 배포 거부/허용도 함께 실측합니다(11단계 "운영 안내" 참고).

## 운영 안내: 학생 판정기·탐지 규칙·접속 앱·자료실 설치·실행·중지·복구

이 절은 1~12단계가 반영된 「12단계 저장점」 커밋 기준으로 적습니다(정확한 커밋은 `git log -1` 참고). 지금까지 토큰(A·B)으로 실제 배포에서 확인한 결과(`own_notes_read`·`device_not_approved`가 `403 DEVICE_NOT_APPROVED`로 실측됨)도 그 커밋 상태를 가리킵니다.

### 누가 만들었는지 (학생 몫 vs 제공 엔진)

| 구성 요소 | 출처 | 비고 |
|---|---|---|
| `public/index.html`, `api/*.js`, `schema.sql`, `src/verify-login.mjs`·`src/device-approval.mjs`·`src/note-restore.mjs`·`src/ops-summary.mjs` | **학생** | 실제 배포된 자료실. 로그인·소유자 검사·역할 미신뢰·기기 승인 게이트(`device_approvals`)·메모 백업/복원이 전부 이 코드로 실제 요청에서 동작합니다. |
| `src/decider.mjs`의 `decide()`, `src/detect.mjs`의 `detect()` | **학생** | `docs/DECIDER_REQUEST.md`·`docs/DETECT_EVENTS.md` 계약 함수만 구현했습니다. **이 배포의 실제 `/api` 요청에는 연결되어 있지 않습니다** — `npm run decider:test`·`detect:test`·`fixture:7`로만 확인되는 로컬 연습입니다(`npm run recon:table`이 이 41건을 모아 보여줍니다). |
| 기기 등록 여부 확인, 접속 신호(`signals`·`recentEvents`) 검증, 재인증 상태 확인 | **ALEPH SDP 엔진**(반 엔진·릴레이) | `decide()`를 부르기 전에 엔진이 먼저 확인하고, 그 결과값(`deviceRegistered` 등)만 학생 함수에 넘겨줍니다. 학생 코드가 이 확인을 대신 구현하지 않습니다. |
| 심판 판정, 제출 묶음 접수 | **ALEPH SDP 엔진**의 심판 접수 서버 | `aleph.config.json`의 `judgeIssuer`가 그 주소이며, 운영 측이 ZIP을 만들 때 채웁니다. 학생이 바꾸지 않습니다. |
| 로그인 토큰 발급·검증(학생 계정) | Supabase Auth(`identityProvider`) | 학생의 Supabase 프로젝트이지만 Auth 서비스 자체는 Supabase가 운영합니다. |
| 기기 승인 상태(`device_approvals`) 판정·거부 | **학생** | ALEPH 엔진의 "기기 등록"과는 별개의, 학생이 직접 만든 계정 단위 승인 시스템입니다. 실제 승인(= `approved`를 `true`로)은 이 코드가 스스로 하지 않고 Supabase 테이블을 직접 바꿔야만 됩니다. |
| `docs/DECIDER_REQUEST.md`·`docs/DETECT_EVENTS.md`(요청·응답 계약 문서), `AGENTS.md`(제작 규칙), `vercel.json`·`aleph.config.json`의 틀(필드 구조) | **제공(시작 틀/운영 측)** | 학생이 처음부터 쓴 문서가 아니라, 어떤 값만 쓸 수 있는지·어떤 모양으로 응답해야 하는지를 정해 둔 틀입니다. 학생은 `aleph.config.json`의 **값**(주소 등)만 채우고, 계약·규칙 문서 자체는 고치지 않습니다. |

### 비밀값 — 포장하지 않고 그대로 밝힙니다

- `SUPABASE_SECRET_KEY`(Vercel 환경변수): RLS를 모두 건너뛰는 서버 전용 키입니다. 이 값이 새어나가면 모든 메모·백업·감사 기록을 누구나 읽고 쓸 수 있습니다 — "그냥 설정값"이 아니라 이 자료실 전체의 유일한 방어선입니다. 코드·README·제출 묶음 어디에도 실제 값을 적지 않고, Vercel 프로젝트 설정의 **Environment Variables** 화면에만 넣습니다.
- `ALEPH_CHECK_TOKEN_A`/`_B`(로그인 토큰): 학생 본인 시험 계정의 접속 토큰입니다. 터미널 환경변수로만 넣고(`$env:ALEPH_CHECK_TOKEN_A="..."`), 파일에 저장하거나 저에게 보내지 않습니다. 터미널을 닫으면 사라집니다.
- `judgeIssuer`·심판 토큰: ALEPH SDP 엔진이 발급·검증하며 학생이 값을 만들거나 바꾸지 않습니다.
- `public/index.html`의 `SUPABASE_PUBLISHABLE_KEY`(`sb_publishable_...`)는 **공개 키**라 코드에 있어도 되지만, 위 서버 전용 키와 이름이 비슷해 헷갈리기 쉬우니 구분해서 봅니다.

### 설치

1. GitHub 저장소(본인 계정, Public) + Vercel 프로젝트 연결(1단계 Deploy 버튼).
2. Supabase 프로젝트를 만들고, `schema.sql` 전체를 **위에서 아래 순서로** SQL Editor에서 실행합니다(2·8·10·11단계 블록이 순서대로 있습니다 — 11단계의 `device_approvals`를 빠뜨리면 `/api/notes`가 전부 `500 DATABASE_QUERY_ERROR`로 죽습니다, 오늘 실측한 그대로).
3. Vercel 프로젝트 설정의 Environment Variables에 `SUPABASE_URL`·`SUPABASE_SECRET_KEY`를 입력합니다(값은 Supabase 프로젝트 설정 화면에서 그대로 복사).
4. `aleph.config.json`의 `publicAppUrl`·`identityProvider`·`originalApiUrl`·`allowedRoutes`를 실제 배포 값으로 맞춥니다. `judgeIssuer`는 손대지 않습니다.

### 실행

- **로컬 데모만**: `npm run build -- --local` (Vercel 배포나 심판 접수를 증명하지 않습니다)
- **배포**: `git push` → Vercel이 `npm run build` 실행 → Git 저장소·커밋·배포 URL을 검증해 `public/aleph.json` 생성 → 실패하면 빈 주소를 내보내지 않고 빌드가 멈춥니다.
- **동작 순서**: 로그인(Supabase Auth) → `/api/devices`로 기기 승인 확인(미승인이면 자료 화면 비움, `/api/notes` 호출 안 함) → 승인된 계정만 `/api/notes`가 열림 → 세션은 저장소에 남기지 않아 새로고침마다 다시 로그인.

### 중지 (지금 가진 수단만 적습니다 — 지어내지 않음)

- **계정 한 개만 막기**: Supabase 테이블 편집기에서 `device_approvals`의 그 `owner_id` 행 `approved`를 `false`로 되돌립니다. 재배포 없이 다음 요청부터 바로 `403 DEVICE_NOT_APPROVED`로 막힙니다(오늘 실측한 거부 경로와 동일).
- **전체 자료실 막기**: Vercel 환경변수에서 `SUPABASE_SECRET_KEY`를 **지우면** 모든 서버 함수가 `500 SERVER_CONFIGURATION_ERROR`로 멈춥니다(코드가 값이 없음을 직접 검사). **값은 있지만 틀리게** 바꾸면 그 검사는 통과하고 실제 DB 조회에서 실패해 `500 DATABASE_QUERY_ERROR`로 멈춥니다 — 증상은 비슷해도 원인 코드가 다릅니다. 되돌릴 때는 올바른 값을 다시 넣고 재배포해야 합니다 — 둘 다 즉각적이지만 거친 중지입니다.
- **DB 자체 막기**: Supabase 프로젝트를 Pause하면 모든 서버 함수가 DB 접근 실패로 멈춥니다. 복구하려면 프로젝트를 Resume해야 합니다.
- 이 저장소에는 "접속 회수 집행" 버튼이나 API가 없습니다 — `detect()`의 `propose_revocation`은 제안만 하며, 실제 집행 수단은 위 세 가지(기기 승인 되돌리기·서버 키 무효화·DB 일시정지)뿐입니다.

### 복구

1. **정책(허용 경로 등) 복구**: `npm run restore:check`로 `docs/policy-backup`의 검증된 사본과 현재 `aleph.config.json`·`src/decider.mjs`의 차이만 확인 → 그 버전을 그대로 `npm run restore:apply -- --confirm-version <버전>`에 넣어야 적용됩니다. 결과는 `docs/policy-backup/audit-log.jsonl`에 추가만 됩니다.
2. **메모 한 건 복구**: 본인 로그인 토큰으로 `curl.exe -i -X POST "<publicAppUrl>/api/notes/<id>/restore" -H "Authorization: Bearer <토큰>"` → `notes_backup`과 ID·소유자·내용 지문이 모두 같을 때만 그 한 건을 되돌리고 `restore_audit`에 한 줄 남습니다.
3. **복구 뒤 재확인**: 위 "복구 뒤 1~9단계 재확인 순서"를 따르고, 로컬 41건은 `node scripts/recon-table.mjs`로, 토큰이 있으면 실제 배포까지 `node scripts/bundle.mjs`로 다시 확인합니다.

### 재현 순서 (처음부터 끝까지 한 번에)

1. `npm install`
2. Supabase에 `schema.sql` 전체 실행 (순서대로, 11단계 `device_approvals` 포함)
3. Vercel 환경변수에 `SUPABASE_URL`·`SUPABASE_SECRET_KEY` 입력
4. `git push` → 배포 대기
5. `npm run recon:table` — 41건 로컬 실측 (미실행 0 확인)
6. 배포 사이트에서 로그인 → 승인 전 자료 없음 확인 → Supabase에서 승인 → 자료실 정상 확인
7. `$env:ALEPH_CHECK_TOKEN_A`/`_B` 설정 후 `node scripts/bundle.mjs` — 실제 배포 거부/허용 실측

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 알려진 불일치 (추후 확인 필요)

`npm run test:package`가 실패 중입니다. `test/package-starter.test.mjs`는 `api/` 폴더에 `ai.js`, `threat-intel.js`만 있어야 한다고 기대하는데(`package/baseline-functions.json` 기준), 실제로는 8단계에서 추가한 `api/announcements.js`, `api/notes.js`가 함께 있어 불일치가 납니다. 이 책임은 8단계 이후부터 있었고 로그인·자료 보호 흐름(정상/거부 결과)과는 무관합니다. 패키징 기준표를 학생의 실제 API 구성에 맞게 갱신할지 결정이 필요합니다.

