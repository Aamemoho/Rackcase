# aamemoho cartridge rack

`aamemoho.com`의 정적 카트리지 랙과 독립 앱을 한 저장소에서 관리합니다.

## 저장소 구조

```text
public/                 랙, 카트리지, 미디어, /status 원본
apps/glowlog/           GlowLog React/Vite 원본
scripts/                카트리지 검증·입고·통합 빌드
tests/                  소스 및 빌드 결과 검증
dist/                   Cloudflare Pages 배포 결과 (Git 제외)
```

## 로컬 준비

```bash
npm install
npm run check
```

`npm run check`는 다음을 순서대로 실행합니다.

1. 랙과 카트리지 테스트
2. GlowLog 단일 HTML 빌드
3. 랙과 GlowLog를 `dist/`로 통합
4. `/glowlog/` 배포 결과 검증

## GlowLog 개발

```bash
npm run dev:glowlog
```

GlowLog 소스는 `apps/glowlog/src/GlowLog.jsx`입니다. 수정 후 `npm run check`를 실행하면 `dist/glowlog/index.html`이 다시 생성됩니다.

## 새 카트리지 입고

```text
incoming/<id>/
├── index.html
├── cartridge.json
└── 필요한 로컬 자산
```

```bash
node scripts/validate-cartridge.mjs incoming/<id>
node scripts/ingest-cartridge.mjs incoming/<id>
npm run check
```

`published: false`인 카트리지는 검증되지만 공개 catalog에는 나타나지 않습니다.

## 안전 경계

외부 CDN·업로드 endpoint·카메라·마이크·위치·WebSocket·폼 제출은 자동 허용하지 않습니다. 필요한 기능은 `capabilities`에 선언한 뒤 사람 검수를 거칩니다. API 키·비밀번호·토큰·개인키는 저장소나 브라우저 코드에 넣지 않습니다.

GlowLog 기록은 현재 사용자의 브라우저 `localStorage`에만 저장되며 서버나 GitHub로 전송되지 않습니다.

## GitHub → Cloudflare Pages

GitHub 저장소에 연결한 뒤 Cloudflare Pages의 빌드 설정을 다음처럼 둡니다.

| 항목 | 값 |
|---|---|
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | 저장소 루트 |

이후 업데이트는 전체 ZIP 재업로드가 아니라 다음 흐름입니다.

```bash
git add -A
git commit -m "feat: update GlowLog"
git push
```

`main`에 push하면 Cloudflare Pages가 새 커밋만 받아 자동으로 빌드·배포합니다. 이전 커밋과 배포 이력도 남아 롤백하기 쉽습니다.

## 공개 경로

```text
/                      카트리지 랙
/glowlog/              GlowLog
/status/               Cloudflare Access로 보호할 체크포인트
/media/field-log-01/   미디어 카트리지
```

`/status/`의 정본은 `/opt/data/project-context/CURRENT_STATUS.md`이며 작업 블록이 실제로 완료됐을 때만 갱신합니다.
