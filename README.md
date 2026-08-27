# KUNG ORBIT — 세글자쿵

초대 링크 하나로 모여 즐기는 오리지널 실시간 한글 리듬 게임입니다. 기존 끝말잇기 게임의 즉시성에서 영감을 받았지만, 이름·우주 탐사 세계관·화면·규칙·코드는 모두 새로 설계했습니다.

## 플레이 기능

- 회원가입 없이 게스트로 빠른 시작, 방 생성, 5자리 코드/링크 초대
- 최대 8명, 혼자 시작하면 자동으로 합류하는 `쿵봇`
- 기본 궤도(12초), 펄스 항로(7초), 자유 항로(2~4글자)
- 서버 권위형 턴/타이머/점수/목숨 판정
- 팀 콤보와 7콤보 피버(점수 2배, 제한 시간 단축)
- 국립국어원 데이터 기반 31,000개 이상의 2~4글자 한국어 명사 엄격 판정
- 빠른 이모지 반응, 라운드 재대결, 모바일 한 손 입력
- 지수 백오프 자동 재접속 및 동일 참가자 복귀
- 외부 광고·결제·후원 기능 없음

## 기술 구성

- Java 21, Spring Boot 4.1.1, Spring WebMVC/WebSocket, Jackson 3
- 의존성 없는 HTML/CSS/JavaScript 프런트엔드(한 개의 Spring JAR에서 제공)
- coders.kr native gate의 `X-Coders-User`를 지원하며, 익명 사용자는 WebSocket 연결 범위의 임시 ID 사용
- 정적 자산 장기 캐시, HTTP 압축, WebSocket 3,600초 timeout, 자동 재연결
- 영속 개인정보/게임 기록 없음. 방은 2시간 후 자동 정리

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

## 배포

`coders.yaml`은 단일 Spring 서비스를 `mode: native`로 공개하며 WebSocket timeout을 최댓값으로 설정합니다. Docker 빌드 단계에서 Maven 패키징을 끝내므로 콜드 스타트 때 설치나 마이그레이션을 실행하지 않습니다.

```sh
docker build -t three-letter-boom .
docker run --rm -p 8080:8080 three-letter-boom
```

## 운영 원칙

- 인메모리 방 상태라 재배포 시 진행 중인 판은 초기화됩니다. 클라이언트는 끊김을 정상 상황으로 보고 자동 재접속합니다.
- 쿵봇과 사람 모두 같은 엄격 사전 판정을 사용합니다. 사전에 없는 문자열, 품사 조건에 맞지 않는 표현, 길이·첫 음절·중복 규칙을 어긴 단어는 점수에 반영되지 않습니다. 쿵봇은 친숙한 명사를 우선 사용하고, 이어갈 단어가 없으면 목숨을 잃는 대신 `리듬 패스`로 새 시작 글자를 던집니다.
- 모든 상태 변경은 서버에서 현재 WebSocket 참가자와 턴을 확인합니다. 클라이언트 점수나 타이머 값은 신뢰하지 않습니다.
