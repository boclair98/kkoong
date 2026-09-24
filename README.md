# KUNG ORBIT — 세글자쿵

초대 링크 하나로 모여 즐기는 오리지널 실시간 한글 리듬 게임입니다. 기존 끝말잇기 게임의 즉시성에서 영감을 받았지만, 이름·우주 탐사 세계관·화면·규칙·코드는 모두 새로 설계했습니다.

## 플레이 기능

- 회원가입 없이 게스트로 빠른 시작, 방 생성, 5자리 코드/링크 초대
- 앱인토스 전용 `duelQueue` 1:1 자동매칭: 같은 모드의 사람 둘이 모이면 자동 시작하며 공개 방 목록에서는 제외
- 앱인토스 공개 방 목록에 사용할 `/api/lobby` 읽기 API는 별도 WebView 출처에서도 접근 가능
- 최대 8명, 혼자 시작하면 자동으로 합류하는 `쿵봇`
- AI 우주 캐릭터 24종 무료 선택: 동물 탐사대 12종, 외계 친구 6종, 로봇 팀 6종
- 분류·페이지·랜덤 선택, 사람/봇 모두 방 안 중복 없는 외형 배정, 재접속 시 외형 유지
- 쿵봇 초급·중급·고급: 초급은 느리고 실수가 있어 처음 플레이어도 승리 가능
- 대기실에서 방장이 쿵봇을 추가·삭제하고 AI 난이도를 조절
- 게임이 진행될수록 3턴마다 제한 시간이 1초씩 줄어드는 템포 시스템(최소 5초)
- 기본 궤도(12초), 펄스 항로(7초), 자유 항로(2~4글자)
- 서버 권위형 턴/타이머/점수/목숨 판정
- 팀 콤보와 7콤보 피버(점수 2배, 제한 시간 단축)
- 국립국어원 데이터 기반 31,000개 이상의 2~4글자 한국어 명사 엄격 판정
- 빠른 이모지 반응, 라운드 재대결, 모바일 한 손 입력
- 로비의 오빗 패스포트: 일일 임무, 연속 출격, XP/레벨, 플레이 통계, 무료 보상 조각, 배지
- 지수 백오프 자동 재접속 및 동일 참가자 복귀
- 턴 전환에도 유지되는 모바일 입력 포커스, VisualViewport 기반 입력 집중 화면
- 제출·턴 전환·시간 초과·재대결 입력 초기화, 한글 IME 중복 제출 방지
- 외부 광고·결제·후원 기능 없음(현재는 플레이 보상만 제공)

## 기술 구성

- Java 21, Spring Boot 4.1.1, Spring WebMVC/WebSocket, Jackson 3
- 의존성 없는 HTML/CSS/JavaScript 프런트엔드(한 개의 Spring JAR에서 제공)
- coders.kr native gate의 `X-Coders-User`를 지원하며, 익명 사용자는 WebSocket 연결 범위의 임시 ID 사용
- 정적 자산 장기 캐시, HTTP 압축, WebSocket 3,600초 timeout, 자동 재연결
- 서버에 영속 개인정보/게임 기록 없음. 방은 2시간 후 자동 정리
- 오빗 패스포트는 로그인 전환 장벽을 낮추기 위해 브라우저 `localStorage`에만 저장하며, 같은 기기·브라우저에서 유지됨

## 사전 데이터

게임 서버는 형식만 맞는 임의 문자열을 허용하지 않습니다. 모든 단어는
`words-ko.txt`에 포함된 명사인지 서버에서 확인한 뒤 승인합니다.

- 원본: `spellcheck-ko/hunspell-dict-ko`
- 적용 리비전: `606164264399ca037325bd41750f9c108ed4c290`
- 변환: 한글로만 구성된 2~4음절 명사 추출, 중복 제거
- 데이터 라이선스: GPL-3.0-or-later
- 고지와 라이선스 전문: `THIRD_PARTY_NOTICES.md`, `third-party/hunspell-dict-ko/`

재생성:

```powershell
.\tools\build-dictionary.ps1 -SourceYaml <hunspell-dict-ko>/dict-ko-data.yaml
```

## 로컬 실행과 테스트

Windows:

```powershell
.\mvnw.cmd test
.\mvnw.cmd spring-boot:run
```

macOS/Linux:

```sh
./mvnw test
./mvnw spring-boot:run
```

브라우저에서 `http://localhost:8080`을 엽니다. 상태 확인은 `/actuator/health`, 로비 상태는 `/api/lobby`입니다.

입력 회귀 테스트(Node.js 내장 테스트 러너, 추가 패키지 불필요):

```sh
node --test tools/game-input.test.cjs tools/crew-catalog.test.cjs tools/progression.test.cjs
```

실제 서버 연결 브라우저 회귀 스크립트는 `tools/browser-input-smoke.js`입니다.
테스트 전용 방의 대기/결과 화면에서 `agent-browser eval --stdin`으로 실행하면
제출·사전 거절·성공·턴 전환·포커스·합성 IME 이벤트·시간 초과를 검증합니다.
브라우저 뷰포트 에뮬레이션은 실제 iOS/Android 키보드 검증을 대체하지 않습니다.
실기기에서는 한글 조합, 키보드 보내기/쿵 버튼, 힌트 탭, 직접 키보드 닫기,
가로/세로 회전, 앱 전환 후 복귀를 별도로 확인해야 합니다.

캐릭터 갤러리·이미지 로딩·선택·8인 봇 방 검증은 로비에서
`tools/browser-crew-smoke.js`를 같은 방식으로 실행합니다. 테스트 전용 방을 생성합니다.
이미지 원본과 전체 생성 프롬프트는 `art-source/CREW_V2.md`에 정리했습니다.
`tools/prepare-crew-assets.cjs`는 보존된 원본을 512px 투명 WebP로 인코딩합니다(Sharp 필요).

## 배포

`coders.yaml`은 단일 Spring 서비스를 `mode: native`로 공개하며 WebSocket timeout을 최댓값으로 설정합니다. Docker 빌드 단계에서 Maven 패키징을 끝내므로 콜드 스타트 때 설치나 마이그레이션을 실행하지 않습니다.

```sh
docker build -t three-letter-boom .
docker run --rm -p 8080:8080 three-letter-boom
```

### 공개 저장소와 운영 배포

- 운영 URL: https://segulja-kkung.coders.kr
- canonical upstream: https://github.com/boclair98/kkoong (GitHub이 기존 `three-letter-boom` 저장소를 이 이름으로 리디렉션)
- organization fork: https://github.com/coders-kr/kkoong (`boclair98/kkoong`의 실제 fork)
- Coders.kr 배포 소스: canonical upstream의 기본 브랜치 `main`

공개 저장소를 갱신할 때는 로컬 검증과 커밋 후 canonical upstream에 먼저 push하고,
`coders-kr` fork를 upstream에서 동기화한 뒤 Coders.kr에서 canonical 저장소를
재배포합니다. 두 저장소의 기본 브랜치 전체 커밋 SHA가 같을 때만 동기화가 끝난
것으로 봅니다.

```sh
git push origin main
gh repo sync coders-kr/kkoong -b main
```

Coders.kr 배포는 `coders.yaml`과 Dockerfile을 사용하며, 배포 후 `/actuator/health`,
`/api/lobby`, production URL을 확인합니다. 배포 토큰은 저장소에 넣지 않고
로컬 `.coders/token` 또는 승인된 비밀 저장소에서만 읽습니다.

### 프로젝트 구조

```text
src/main/java/.../game/       서버 권위형 게임 상태·사전·봇 난이도
src/main/java/.../web/        REST, WebSocket, 정적 홈 컨트롤러
src/main/resources/static/    의존성 없는 게임 UI, CSS, 캐릭터 자산
src/main/resources/static/progression.js  로그인 전 로컬 성장·임무 규칙
src/main/resources/static/progression.css 패스포트·임무·배지 UI
src/main/resources/words-ko.txt  검증된 한국어 명사 데이터
src/test/                     Spring/WebSocket/사전/난이도 테스트
tools/                        브라우저 스모크와 사전·자산 도구
```

### 환경 변수와 개인정보

현재 필수 환경 변수와 외부 API 키는 없습니다. 서버는 영속적인 회원·결제·게임
기록을 저장하지 않으며, 방 상태는 메모리에만 존재하고 재배포 또는 만료 시
정리됩니다. 오빗 패스포트의 XP·임무·배지는 브라우저 로컬 데이터이며 서버와
동기화되지 않습니다. 로컬 자격 증명, 환경 파일, 로그, 데이터베이스 파일, 개인 키는
`.gitignore`로 공개 저장소에서 제외합니다.

### 수익화 준비 로드맵(현재는 완전 무료)

수익화를 먼저 붙이지 않고, 재방문과 공정한 플레이를 확인한 뒤 다음 순서로
확장할 수 있도록 기반을 분리했습니다.

1. 현재 단계: 일일 임무·연속 출격·배지로 사용자가 자신의 플레이 습관을 확인합니다. 기록은 브라우저에만 남고 운영 분석으로 전송되지 않으며, 모든 보상은 플레이로만 얻습니다.
2. 계정 단계: 선택적 로그인과 서버 저장을 추가해 여러 기기에서 패스포트와 시즌 기록을 동기화합니다. 게스트 플레이는 유지합니다.
3. 시즌 단계: 시즌 미션·랭킹·꾸미기 컬렉션을 운영하고, 밸런스와 사전 품질을 모니터링합니다.
4. 유료 단계(후속 결정): 경쟁력에 영향을 주지 않는 꾸미기·시즌 패스만 검토하며, 결제·환불·미성년자 보호 정책을 먼저 준비합니다.

현재 2~4단계의 계정·결제·광고·외부 제출 연동은 구현하지 않았습니다. 따라서
패스포트의 로컬 기록을 구매 가능 상품이나 현금 가치가 있는 잔액으로 안내하지 않습니다.

### 공개 전 검증 체크리스트

- `./mvnw test` 및 필요한 Node 회귀 테스트 통과
- 360×800, 390×844, 768×1024, 1440×900에서 가로 넘침·겹침·잘림 확인
- 한글 IME 입력, 방 생성/입장, 봇 추가·삭제·난이도, 사전 거절/성공 확인
- 키보드 포커스, 라벨, 터치 영역, 콘솔 오류와 실패 요청 확인
- `/actuator/health`가 `UP`이고 production URL이 HTTP 200인지 확인

실제 제출·결제·후원·공식 서비스 연동은 제공하지 않습니다. 게임 내 단어 판정과
점수는 서버가 검증하며, 외부 사전 API 응답을 만들어내지 않습니다.

## 운영 원칙

- 인메모리 방 상태라 재배포 시 진행 중인 판은 초기화됩니다. 클라이언트는 끊김을 정상 상황으로 보고 자동 재접속합니다.
- 쿵봇과 사람 모두 같은 엄격 사전 판정을 사용합니다. 사전에 없는 문자열, 품사 조건에 맞지 않는 표현, 길이·첫 음절·중복 규칙을 어긴 단어는 점수에 반영되지 않습니다. 쿵봇은 친숙한 명사를 우선 사용하고, 이어갈 단어가 없으면 목숨을 잃는 대신 `리듬 패스`로 새 시작 글자를 던집니다.
- 모든 상태 변경은 서버에서 현재 WebSocket 참가자와 턴을 확인합니다. 클라이언트 점수나 타이머 값은 신뢰하지 않습니다.
