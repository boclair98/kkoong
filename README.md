# 세글자쿵!

초대 링크 하나로 모여 즐기는 오리지널 실시간 한글 리듬 게임입니다. 기존 끝말잇기 게임의 즉시성에서 영감을 받았지만, 이름·화면·규칙 확장·코드는 모두 새로 설계했습니다.

## 플레이 기능

- 회원가입 없이 게스트로 빠른 시작, 방 생성, 5자리 코드/링크 초대
- 최대 8명, 혼자 시작하면 자동으로 합류하는 `쿵봇`
- 정통 세글자(12초), 번개 세글자(7초), 자유 릴레이(2~4글자)
- 서버 권위형 턴/타이머/점수/목숨 판정
- 팀 콤보와 7콤보 피버(점수 2배, 제한 시간 단축)
- 내장 사전 보너스와 열린 한글 판정의 혼합
- 빠른 이모지 반응, 라운드 재대결, 모바일 한 손 입력
- 지수 백오프 자동 재접속 및 동일 참가자 복귀
- 외부 광고·결제·후원 기능 없음

## 기술 구성

- Java 21, Spring Boot 4.1.1, Spring WebMVC/WebSocket, Jackson 3
- 의존성 없는 HTML/CSS/JavaScript 프런트엔드(한 개의 Spring JAR에서 제공)
- coders.kr native gate의 `X-Coders-User`를 지원하며, 익명 사용자는 WebSocket 연결 범위의 임시 ID 사용
- 정적 자산 장기 캐시, HTTP 압축, WebSocket 3,600초 timeout, 자동 재연결
- 영속 개인정보/게임 기록 없음. 방은 2시간 후 자동 정리

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

## 배포

`coders.yaml`은 단일 Spring 서비스를 `mode: native`로 공개하며 WebSocket timeout을 최댓값으로 설정합니다. Docker 빌드 단계에서 Maven 패키징을 끝내므로 콜드 스타트 때 설치나 마이그레이션을 실행하지 않습니다.

```sh
docker build -t three-letter-boom .
docker run --rm -p 8080:8080 three-letter-boom
```

## 운영 원칙

- 인메모리 방 상태라 재배포 시 진행 중인 판은 초기화됩니다. 클라이언트는 끊김을 정상 상황으로 보고 자동 재접속합니다.
- 쿵봇은 내장 사전에 검증된 단어만 말합니다. 사전에 이어갈 단어가 없으면 목숨을 잃는 대신 `리듬 패스`로 새 시작 글자를 던집니다. 사람은 내장 사전이 놓친 정상 단어 때문에 게임이 끊기지 않도록 길이·한글·첫 글자·중복을 서버에서 판정하고, 사전 등재 단어에 추가 점수를 줍니다.
- 모든 상태 변경은 서버에서 현재 WebSocket 참가자와 턴을 확인합니다. 클라이언트 점수나 타이머 값은 신뢰하지 않습니다.
