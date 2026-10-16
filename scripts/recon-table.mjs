// 1~11단계에 걸쳐 이미 구현된 실제 가상 시험 41건(decider:test 11 + detect:test 6 +
// fixture:7 2 + test:r5 2 + test:restore 10 + test:note-restore 4 + test:device-approval 6)을
// 지금 다시 실행해 한 표로 모읍니다. 실행하지 않은 항목을 통과로 적지 않습니다 — 이
// 스크립트가 다루는 41건은 전부 로컬에서 바로 실행할 수 있어, 끝까지 돌면 전부
// 실행됨(미실행 없음)이 보장됩니다. 요청ID는 decider.mjs 계약의 실제 requestId만
// 쓰고, 그런 값이 없는 계약(detect, 단위 시험)에는 "요청ID 없음"을 그대로 적습니다.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// 이름 → {step, kind}. 이름은 각 시험 파일의 실제 case 이름과 정확히 같아야 합니다.
// kind는 README의 "정상 결과"(정상) / "거부돼야 할 결과"(금지)를 따릅니다. step_up은
// 추가 확인 전까지 접근을 막으므로 금지로 분류합니다.
const CLASSIFY = {
  '등록 기기의 정상 요청': { step: '6', kind: '정상' },
  '미등록 기기의 가상 요청': { step: '6', kind: '금지' },
  '등록되지 않은 경로': { step: '8', kind: '금지' },
  '구역이 섞인 요청(route는 메모, service는 공지)': { step: '8', kind: '금지' },
  '메모 전체 목록 경로(여러 사람의 자료를 한꺼번에 여는 모양)': { step: '8', kind: '금지' },
  '복합 이상 접속': { step: '7', kind: '금지' },
  '다시 확인한 복합 이상 접속': { step: '7', kind: '정상' },
  '쓰기 구역의 약한 이상 접속': { step: '8', kind: '금지' },
  '다시 확인한 쓰기 구역 접속': { step: '8', kind: '정상' },
  '네트워크+다량 조회 복합 의심(시각은 정상)': { step: '9', kind: '금지' },
  '네트워크만 다른 정상 사건': { step: '9', kind: '정상' },
  '정상 사건': { step: '7', kind: '정상' },
  '복합 이상 사건': { step: '7', kind: '금지' },
  '정상 조회 30건': { step: '9', kind: '정상' },
  '10분 안에 120건': { step: '9', kind: '정상' },
  '10분 안에 121건': { step: '9', kind: '금지' },
  '폭주 조회 200건': { step: '9', kind: '금지' },
  '서로 다른 사용자 각 100건': { step: '9', kind: '정상' },
  '10분 밖으로 흩어진 조회 200건': { step: '9', kind: '정상' },
  '백업이 없으면 적용하지 않고 감사 이력에 중단을 남긴다': { step: '10', kind: '금지' },
  '확인용 버전을 넣지 않거나 틀리면 적용하지 않는다': { step: '10', kind: '금지' },
  '확인된 복원: B가 쓰던 위험한 경로는 사라지고 A의 정상 경로는 남으며, 다른 설정은 보존된다': { step: '10', kind: '정상' },
  '여러 번 실행해도 감사 이력은 지워지지 않고 쌓인다': { step: '10', kind: '정상' },
  '백업과 현재 정책이 같으면 아무것도 쓰지 않는다': { step: '10', kind: '정상' },
  '백업 사본이 없으면 차이를 보여주지 않고 중단한다': { step: '10', kind: '금지' },
  '지문이 사본 내용과 다르면 중단한다': { step: '10', kind: '금지' },
  '형식이 다른 사본도 중단한다(지문은 맞아도)': { step: '10', kind: '금지' },
  '검증된 백업과 현재 정책의 차이만 보여준다': { step: '10', kind: '정상' },
  '백업과 현재 정책이 같으면 차이 없음을 보여준다': { step: '10', kind: '정상' },
  '백업 사본이 없으면 복원하지 않고 중단을 기록한다': { step: '10', kind: '금지' },
  '백업의 소유자가 다르면 존재 여부를 알리지 않고 중단한다': { step: '10', kind: '금지' },
  '내용 지문이 사본과 다르면 복원하지 않는다': { step: '10', kind: '금지' },
  '검증된 복원: 시험 계정 B의 지정한 메모 한 건만 되돌리고, 다른 메모와 기존 감사 기록은 보존된다': { step: '10', kind: '정상' },
  '승인 요청 기록이 없으면 미요청·미승인으로 본다': { step: '11', kind: '금지' },
  '요청만 있고 아직 승인되지 않은 행은 대기 상태로 본다': { step: '11', kind: '금지' },
  '승인된 행만 승인됨으로 본다': { step: '11', kind: '정상' },
  '다른 계정의 승인 행은 보지 않는다': { step: '11', kind: '금지' },
  '승인 요청은 대기 행만 만들고 스스로 승인하지 않는다': { step: '11', kind: '금지' },
  '이미 승인된 뒤 재요청해도 승인 상태를 되돌리지 않는다': { step: '11', kind: '정상' },
  'build identity uses Vercel Git and deployment metadata': { step: '1', kind: '정상' },
  'first attack check reads public data.json without credentials': { step: '1', kind: '정상' },
};

const EXPECTED_TOTAL = 41;
const NO_REQUEST_ID = '요청ID 없음(이 계약에 없는 값)';
const NO_REQUEST_ID_LOCAL = '요청ID 없음(로컬 단위 시험)';

function decisionText(decision, reasonCode) {
  return reasonCode ? `${decision} · ${reasonCode}` : String(decision);
}

async function deciderRows() {
  const { decide, RULE_IDS } = await import('../src/decider.mjs');
  const { checkDecider } = await import('./decider-test.mjs');
  const at = new Date().toISOString();
  const results = await checkDecider({ decide, ruleIds: RULE_IDS });
  return results.map((r) => {
    const meta = CLASSIFY[r.name];
    return {
      step: meta?.step ?? '?', kind: meta?.kind ?? '?', name: r.name,
      expected: decisionText(r.expectedDecision, r.expectedReasonCode),
      observed: decisionText(r.observedDecision, r.observedReasonCode),
      requestId: r.requestId ?? NO_REQUEST_ID, at, status: r.passed ? '통과' : '실패',
    };
  });
}

async function detectRows() {
  const { detect } = await import('../src/detect.mjs');
  const { checkDetection } = await import('./detect-test.mjs');
  const at = new Date().toISOString();
  const results = await checkDetection(detect);
  return results.map((r) => {
    const meta = CLASSIFY[r.name];
    return {
      step: meta?.step ?? '?', kind: meta?.kind ?? '?', name: r.name,
      expected: decisionText(r.expectedAction, r.expectedReasonCode),
      observed: decisionText(r.observedAction, r.observedReasonCode),
      requestId: NO_REQUEST_ID, at, status: r.passed ? '통과' : '실패',
    };
  });
}

async function fixtureRows() {
  const { decide } = await import('../src/decider.mjs');
  const { runFixtureChecks } = await import('./fixture-7.mjs');
  const at = new Date().toISOString();
  const results = await runFixtureChecks(decide);
  return results.map((r) => {
    const meta = CLASSIFY[r.name];
    return {
      step: meta?.step ?? '?', kind: meta?.kind ?? '?', name: r.name,
      expected: r.expectedDecision, observed: r.observedDecision,
      requestId: r.requestId ?? NO_REQUEST_ID, at, status: r.passed ? '통과' : '실패',
    };
  });
}

// node --test의 TAP 출력에서 "ok N - 이름"/"not ok N - 이름" 줄만 읽습니다. 다른 시험
// 파일(예: package-starter.test.mjs)이 섞여 있어도 CLASSIFY에 없는 이름은 버립니다 —
// 41종 표에 속하지 않는 시험을 끌어오지 않기 위함입니다.
async function unitTestRows(relativeFile) {
  const at = new Date().toISOString();
  let output;
  try {
    output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', relativeFile], {
      cwd: root, encoding: 'utf8', timeout: 30000,
    });
  } catch (error) {
    output = error.stdout ?? '';
  }
  const rows = [];
  const lineRe = /^(ok|not ok) \d+ - (.+)$/u;
  for (const line of output.split(/\r?\n/u)) {
    const match = lineRe.exec(line.trim());
    if (!match) continue;
    const meta = CLASSIFY[match[2]];
    if (!meta) continue;
    rows.push({
      step: meta.step, kind: meta.kind, name: match[2],
      expected: match[2], observed: match[1] === 'ok' ? '기대대로 동작함' : '기대와 다름(확인 필요)',
      requestId: NO_REQUEST_ID_LOCAL, at, status: match[1] === 'ok' ? '통과' : '실패',
    });
  }
  return rows;
}

function toMarkdownTable(rows) {
  const header = ['단계', '유형', '확인 항목', '기대 결과', '실제 결과', '요청ID', '확인 시각', '상태'];
  const escape = (value) => String(value).replaceAll('|', '\\|');
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${[r.step, r.kind, r.name, r.expected, r.observed, r.requestId, r.at, r.status]
      .map(escape).join(' | ')} |`),
  ];
  return lines.join('\n');
}

const rows = [
  ...(await deciderRows()),
  ...(await detectRows()),
  ...(await fixtureRows()),
  ...(await unitTestRows('test/restore-apply.test.mjs')),
  ...(await unitTestRows('test/restore-check.test.mjs')),
  ...(await unitTestRows('test/note-restore.test.mjs')),
  ...(await unitTestRows('test/device-approval.test.mjs')),
  ...(await unitTestRows('test/r5.test.mjs')),
];

const passCount = rows.filter((r) => r.status === '통과').length;
const failCount = rows.filter((r) => r.status === '실패').length;
const normalCount = rows.filter((r) => r.kind === '정상').length;
const forbiddenCount = rows.filter((r) => r.kind === '금지').length;

await mkdir(resolve(root, 'artifacts'), { recursive: true });
await writeFile(resolve(root, 'artifacts', 'recon-table.md'),
  `${toMarkdownTable(rows)}\n`, 'utf8');
await writeFile(resolve(root, 'artifacts', 'recon-table.json'),
  `${JSON.stringify(rows, null, 2)}\n`, 'utf8');

process.stdout.write(`${toMarkdownTable(rows)}\n\n`);
process.stdout.write(`총 ${rows.length}건 실행 (기대 ${EXPECTED_TOTAL}건) · 통과 ${passCount} · 실패 ${failCount} · 미실행 0`
  + ` · 정상 요청 ${normalCount}건 · 금지 요청 ${forbiddenCount}건\n`);
process.stdout.write('모두 지금 실제로 실행한 결과이며, 가상 연습(decider/detect/fixture)과 단위 시험 모두 심판 판정이 아닙니다.\n');

if (rows.length !== EXPECTED_TOTAL) {
  process.stderr.write(`경고: 표에 모인 항목이 ${rows.length}건으로 기대(${EXPECTED_TOTAL}건)와 다릅니다 — CLASSIFY 목록을 다시 확인하세요.\n`);
  process.exitCode = 1;
}
if (failCount > 0) process.exitCode = 1;
