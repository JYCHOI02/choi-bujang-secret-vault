# 정책 백업 사본

`npm run restore:check`이 비교하는 "침해 전에 검증한 안전 정책 사본"은 이 폴더에 둡니다.

- `policy.json` — 정책 사본. 아래 모양만 허용합니다.
  ```json
  {
    "schema": "aleph.policy.backup.v1",
    "version": "<백업 시점의 커밋 SHA 등 식별자>",
    "capturedAt": "<백업 시점 UTC ISO 시각>",
    "allowedRoutes": ["GET /api/notes", "..."],
    "ruleIds": ["device_registered", "..."]
  }
  ```
- `policy.sha256` — 위 `policy.json` 파일 내용 그대로의 SHA-256 16진 지문 한 줄.

두 파일은 정책이 침해되지 않았다고 확인한 시점에 함께 만들어 둡니다. `policy.sha256`은
`policy.json`과 같은 저장소에만 있으면 저장소 자체가 침해됐을 때 함께 바뀔 수 있으므로,
가능하면 별도 매체(심판이 발급한 값, 오프라인 사본)에도 같은 지문을 남겨 대조하세요.

이 폴더가 비어 있거나 지문이 `policy.json`과 다르면 `npm run restore:check`은 차이를
보여주지 않고 중단합니다. 이는 오류가 아니라 의도한 안전장치입니다.
