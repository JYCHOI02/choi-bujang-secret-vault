// 확인용 읽기 모듈입니다. decide.mjs는 이 파일을 불러오지 않습니다.
// xdr/fixtures/exfiltration.json 경보를 읽기만 하며 원본은 고치지 않습니다.
// 시각(timestamp)·출발 주소(data.srcip)·계정(data.srcuser)·규칙 수준(rule.level)·
// 설명(rule.description) 다섯 값만 뽑습니다. data.dstip·data.bytes·data.files는
// 뽑지도, 출력하지도 않습니다.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'exfiltration.json');

export async function readAlerts(fixturePath = FIXTURE_PATH) {
  const raw = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(raw);
  const alerts = Array.isArray(fixture.alerts) ? fixture.alerts : [];
  return alerts.map((alert) => ({
    timestamp: alert.timestamp,
    srcip: alert?.data?.srcip,
    srcuser: alert?.data?.srcuser,
    level: alert?.rule?.level,
    description: alert?.rule?.description,
  }));
}

async function main() {
  const rows = await readAlerts();
  for (const row of rows) {
    console.log(`${row.timestamp}\t${row.srcip}\t${row.srcuser ?? ''}\tlevel=${row.level}\t${row.description}`);
  }
  console.error(`경보 건수 ${rows.length} · 뽑은 줄 수 ${rows.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
