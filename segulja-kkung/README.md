# 세글자쿵 Apps in Toss

기존 `kkoong`의 실시간 한글 단어 게임을 Apps in Toss WebView에 맞게 포장한
프런트엔드 프로젝트입니다. 회원가입 없이 빠르게 시작하고, 친구 초대 코드와
쿵봇으로 혼자서도 바로 플레이할 수 있습니다.

## 구현 범위

- Apps in Toss 공식 Web Framework 기반 번들 구성
- `segulja-kkung` 앱 이름과 투명 게임 내비게이션 설정
- 모바일 safe-area 대응
- 앱인토스 WebView에서도 canonical 서버(`https://segulja-kkung.coders.kr`)를
  호출하도록 API/WebSocket 주소 분리
- 친구 초대 링크를 `intoss://segulja-kkung?room=...` 딥링크로 생성
- 기존 게임의 빠른 시작, 방 코드, 쿵봇, 사전 확인, 로컬 패스포트 흐름 유지

현재 게임 서버와 사전 판정은 canonical Coders.kr 서비스에 있습니다. Toss 계정
로그인, 서버 기반 패스포트 동기화, 공식 랭킹, 결제와 광고는 구현하지 않았습니다.
따라서 이 번들은 게스트 플레이와 기기 내 기록을 제공하며, 앱인토스 콘솔의
검수·출시 승인 전에는 테스트 배포로만 사용할 수 있습니다.

## 로컬 실행

저장소 루트에서 Spring 서버를 먼저 실행합니다.

```powershell
.\mvnw.cmd spring-boot:run
```

그 다음 이 디렉터리에서 Apps in Toss 프런트엔드를 실행합니다.

```powershell
npm install
npm run dev
```

개발 서버는 `http://127.0.0.1:5173`에서 열리고, 로컬 API는
`http://localhost:8080`을 사용합니다. 개발 브라우저와 Spring 서버를 동시에
실행해야 방 생성과 WebSocket 게임을 확인할 수 있습니다.

## 빌드와 업로드

Node.js 24 이상과 npm이 필요합니다.

```powershell
npm run build
npm run deploy
```

`npm run build`는 `dist/`와 Apps in Toss용 `.ait` 번들을 생성합니다. 번들 파일과
`node_modules`는 Git에 커밋하지 않도록 `.gitignore`에 포함되어 있습니다.

실제 업로드는 Apps in Toss 콘솔의 `세글자쿵` 미니앱(`segulja-kkung`)에서
번들 업로드 → 빌드 확인 → 테스트 푸시 순서로 진행합니다. 사용자가 실제 Toss
앱에서 테스트한 뒤에만 기능 등록과 첫 검수를 요청해야 합니다.

## 구조

```text
public/                 기존 게임 화면·스타일·캐릭터 자산
index.html              Vite 진입점
apps-in-toss.config.ts  앱 이름, 브랜드, 게임 내비게이션 설정
package.json            dev/build/deploy 명령
```

## 운영 주소와 저장소

- 게임 서버: https://segulja-kkung.coders.kr
- canonical upstream: https://github.com/boclair98/kkoong
- organization fork: https://github.com/coders-kr/kkoong
- Apps in Toss service link: `intoss://segulja-kkung`

앱인토스 번들은 canonical 저장소의 `main` 기준으로 만들고, 변경 사항은
canonical 저장소에 먼저 반영한 뒤 organization fork를 동기화합니다. 배포 토큰,
Coders.kr 토큰, 환경 파일은 저장소에 넣지 않습니다.
