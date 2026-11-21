# 세글자쿵 · 함께 출격하는 로비

## 2026-11-21 작업 범위와 근거

기존 Java 17 / Spring Boot / vanilla JS 웹 게임을 업그레이드한다. 앱인토스 번들은 수정하지 않는다. 현재 로비, 대기실, 대전, 결과, 캐릭터, 기록의 흐름과 우주 아케이드 정체성을 유지한다.

Stitch 프로젝트: https://stitch.google.com/u/1/projects/9735065909086232955?pli=1 . 사용자가 탭을 다시 연 뒤 연결이 복구되어 기존 6개 시안과 Cosmic Orbit Arcade 팔레트, 모바일 로비/대전, 대기실/결과 구성의 DOM과 캔버스를 확인했다. 공개 방 찾기와 초대 전용 대기실을 중심으로 모바일 시안 2개를 추가 요청했다. 시안의 예시 인원·점수·사전 API·채팅·보이스·특수능력은 실제 기능과 다르므로 구현 근거로 사용하지 않는다.

주요 사용자는 모바일에서 처음 시작하거나 친구와 함께하는 한글 단어게임 이용자다. 첫 행동은 빠른 매칭, 친구 방 만들기, 받은 코드 입장이다. 광고·결제·후원은 없고 성장 기록은 기기에만 저장된다.

확인한 문제: 친구 방 생성이 공개 로비와 자동매칭에 노출된다. 로비에는 모드별 탐색이 없고 사람/봇/빈자리 정보가 모호하다. 새로고침 실패 시 오래된 방이 입장 가능한 것으로 남는다. 모드 선택 카드는 즉시 입장이라는 동작이 있지만 방 목록이 기록·캐릭터 아래에 있어 찾기 어렵다. 여러 CSS 계층에 작은 글자 규칙이 있어 새로운 영역은 명시적인 읽기 크기를 사용한다.

## 하나의 디자인 방향

우주 정거장의 출격 안내판. 큰 시작 메시지와 기존 캐릭터 하나를 중심으로 첫 행동을 명확히 제시하고, 실제 공개 방 목록을 모드 선택 직후에 배치한다. 프로필/기록은 이후 탐색한다. 히어로 장식이나 가상 접속자·성과를 추가하지 않는다.

- 핵심 메시지: 세 글자로 우주를 쿵!
- 주 CTA: 빠른 매칭 → useIdentityThen('quick', {mode:'classic'}).
- 보조 CTA: 친구 방 만들기 → openSetup('create', {inviteOnly:true}).
- 받은 코드: joinForm → 검증 후 join; 공개 방 생성: publicRoomButton → create, inviteOnly:false.
- 시작 전: 닉네임·모드·쿵봇 난이도·공개 범위를 명시. 초대 전용은 목록/매칭에서 제외하지만 코드를 아는 사람은 입장할 수 있다. 비밀번호 보호라고 표현하지 않는다.
- 대기실: 공개/초대 전용 배지와 설명, 기존 코드 공유·쿵봇·난이도·시작 유지.
- 방 찾기: 전체/클래식/번개/릴레이 필터, 서버 필터 후 최대 12개. 실제 빈자리, 사람, 봇과 난이도 표시. 로딩/없음/실패/재시도 구분. 필터 변경 중 오래된 응답 무시.
- 대전: Stitch의 단어 궤도 리본을 실제 최근 단어 4개로 연결한다. 기존 단일 한글 입력창을 보존하고 분할 입력으로 IME를 방해하지 않는다. 키보드 집중 모드에서는 기존 타이머·캐릭터·현재 음절이 우선이다.
- 결과: Stitch의 시상대를 실제 서버 승자 우선 순위의 상위 최대 3명으로 구성한다. 없는 참가자는 만들지 않는다. 서버 점수·캐릭터·이름과 기존 플레이 리포트/전체 순위를 유지한다.

## OpenUI resolved inputs

- Topic: 세글자쿵 KUNG ORBIT 실시간 한국어 단어 게임.
- Offer: 가입 없이 최대 8명, 세 가지 규칙, 초대 전용 방과 공개 매칭, 24개 무료 캐릭터.
- Audience: 모바일 초보자와 친구끼리 가볍게 대결하는 한국어 사용자.
- Primary user action: 공개 매칭 또는 친구 초대 방을 시작한다.
- Deliverable: 기존 Spring 정적 HTML/CSS/JavaScript 파일을 유지하는 하나의 완성된 웹 게임.
- Style direction: Cosmic Orbit Arcade, 우주 정거장 출격 안내판.
- Tonal key: Dark, 기존 우주 배경.
- Icon policy: Minimal, 기존 게임 기호와 캐릭터만 사용.
- Proof assets: 실제 24개 크루 자산, 서버의 실제 공개방·자리·인원 데이터, 실제 게임 사전.
- Motion intensity: Minimal, 버튼과 상태 전환 피드백. reduced-motion과 기존 가벼운 연출 지원.

## Composition contract

Hero archetype: immersive. First viewport: 상단 브랜드/연결, 큰 메시지, 매칭/친구 CTA, 선택 크루와 하나의 단어 연결 예시. 모바일에서는 조작과 메시지 먼저, 캐릭터 다음.
Primary artifact: 기존 캐릭터와 '고구마 → 마법사' 규칙 예시; 예시라는 표시 유지.
Interaction: 모드 즉시 매칭, 공개방 필터는 서버 조회, 친구방은 명시적 초대 범위 선택, 모든 설정은 서버 상태로 렌더링.
Reuse boundary: 기존 디자인 토큰·레이아웃·24개 자산·게임 ID/API를 재사용. 새 랜딩 템플릿, 라이브러리, 계정/결제 기능을 도입하지 않는다. 제품의 방 카드/설정 그룹은 실제 게임 조작이므로 마케팅 장식 카드 제한의 예외다.

## 시각 시스템

기존 --night #080b14, --panel rgba(16,22,37,.94), --ink #f5f8ff, --muted #a8b4c8, --cyan #00e8f5, --violet #a764ff, --gold #ffbf4a 재사용. 민트 #9bf0dd는 선택/입장 가능, 금색 #ffcf7a는 초대 범위, 붉은색 #ffc0c5는 실패 안내에만 사용.
폰트는 기존 Pretendard/SUIT → Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic → system sans. 제목 24~48px/750~850/1.2~1.4, 본문 14~16px/400~600/1.55, 메타 12~13px/1.5, 방코드는 monospace 20px/750. 한국어 keep-all, 긴 코드 overflow-wrap:anywhere, flex/grid 자식 min-width:0.
공간은 4/8/12/16/24/32/48px 단위. 콘텐츠 폭 기존 1320px 유지, 모바일 16px 여백. 새 목록·필터는 12~16px 반경, 한 겹 얇은 테두리. 조작 최소 높이 44px, 제출/시작 52px. 선택은 색과 aria-pressed/라디오 상태를 함께 제공.

## 섹션·접근성·자산

히어로 → 초대코드 → 모드 → 공개방 → 캐릭터 → 사전 → 기록 → 기존 지원 안내. 새 Stitch SCREEN_134/SCREEN_120의 간결한 첫 행동과 방 탐색 순서를 반영한다. 모바일 히어로의 중복 장식은 줄이고 캐릭터와 두 단어 예시를 140px의 가로 영역에 정렬한다. 작은 화면 공개방은 한 열, 필터는 4개 균등 폭; 태블릿 두 열, PC 세 열. 필터는 스크롤 이동 없이 선택 상태 유지. 빈 목록에도 공개방 생성 제공. 시안의 6자리 코드, 가짜 방 제목, 준비 토글·슬롯 잠금·10라운드는 기존 서버와 맞지 않아 반영하지 않는다.
기존 assets/crew-v2/*.webp, cosmic-mascots-v1.png, orbit-arena-keyart.png만 사용. 캐릭터 접근성 이름은 기존 캐릭터 이름, 장식은 aria-hidden. 방 상태 갱신은 간결한 status로 안내하며 주기 갱신이 포커스된 방 버튼을 제거하지 않게 한다. 의미 있는 fieldset/legend, 버튼, dialog 제목 연결과 focus-visible 유지. reduced-motion 시 새로운 애니메이션 없음.

## 변경 경로·계약·검증

src/main/resources/static/index.html, app.js, release-ui.css; Java GameRoom/RoomService/WebSocket 및 로비 컨트롤러; Java 회귀 테스트와 실제 HTTP/WebSocket 스모크; README. 기존 protocolVersion:1 앱인토스는 inviteOnly 생략 시 공개로 유지, protocolVersion:2 복귀 토큰도 유지. 단어 판정/IME/턴 타이머/BGM/24캐릭터/성장 기능 유지.
Maven verify, Node 테스트, 실제 두 명 소켓 초대방/공개 매칭/필터 검증. 브라우저 360×800,390×844,768×1024,1440×900 스크린샷·넘침·모드/초대/입장·키보드 포커스·오류 점검. 실제 모바일 키보드와 소리는 물리 기기 검증과 구분한다.
배포는 안전 검사 후 canonical main push → 실제 coders-kr fork 동기화/full SHA 비교 → 기존 Coders 프로젝트 ready 확인 → 운영 기능/화면 확인 순서. 브라우저 연결 문제로 미검증된 항목은 완료로 보고하지 않는다.

## Fully resolved OpenUI master prompt

Create one high-concept page for 세글자쿵 KUNG ORBIT 실시간 한글 게임.

## Inputs
- Topic: 세글자쿵 KUNG ORBIT 실시간 한글 게임.
- Offer: 가입 없이 최대 8명, 3가지 규칙, 초대 전용 방과 공개 매칭, 무료 캐릭터 24종
- Audience: 모바일 초보자와 친구끼리 대결하는 한국어 사용자
- Primary user action: 공개 매칭이나 친구 초대 방을 시작
- Deliverable: 기존 Spring 정적 HTML/CSS/JavaScript 웹 게임
- Style direction: Cosmic Orbit Arcade, 우주 정거장 출격 안내판
- Tonal key: Dark, 기존 우주 배경
- Icon policy: Minimal, 기존 게임 기호와 캐릭터
- Proof assets: 실제 24종 자산, 서버의 공개 방과 빈자리 데이터, 실제 게임 사전
- Motion intensity: Minimal, 상태·조작 피드백과 reduced-motion 지원

## Objective
Design one premium, memorable page with a dominant hero and one coherent visual world derived from the topic itself.
The result should feel specific, intentional, and action-oriented when the concept calls for action, not like a generic startup or SaaS template.

Choose the strongest clear solution.
Do not collapse the concept into a simpler generic pattern just to make execution easier.

- Treat single-file execution as a packaging constraint, not a creative constraint.
Do not reduce conceptual ambition, visual specificity, interaction richness, or production quality merely because the deliverable is concise.

## Internal concept choice
Before composing, decide internally:
- one dominant hero archetype: centered / asymmetrical / immersive
- one dominant proof mode: none / embedded gesture / single artifact
- one palette driver derived from the topic
- one tonal key: light / mid / dark / topic-derived
- one motion role: none / minimal / ambient / interactive
- one icon approach: none / minimal / expressive / topic-native
- optionally one secondary accent only if it strengthens the main direction without creating a second visual world
Do not output this planning.

## Non-negotiables
- Use a strong hero-first composition.
- Headline: 3-12 words, max 3 lines.
- Supporting copy: 1-2 short sentences, concise and specific.
- CTAs are optional. If used, include at most 1 primary and 1 secondary CTA.
- If a clear next step is central to the offer or concept, include a CTA; otherwise CTA omission is allowed.
- CTA labels must be specific to the offer and action, not generic.
- Supporting highlights are optional. If used, show them only once in a single lower support cluster beneath the hero.
- Keep the hero dominant, focused, readable, and uncluttered.
- Proof is optional. Use it only if it clearly strengthens the concept.
- If no real proof assets are provided, do not invent metrics, testimonials, customer logos, screenshots, or fake UI proof.
- Prefer depth inside the hero, proof gesture, CTA behavior, support copy, or background logic rather than adding extra sections by default.

## Composition
- Choose the clearest structure for the topic; do not default to generic two-column marketing layouts.
- A top navigation bar is optional. When used, make it native to the chosen style direction and subordinate to the hero rather than a generic boxed header.
- The hero may be fully integrated rather than framed.
- The hero does not need to become a panel, dashboard, device mockup, rounded card, or floating showcase unless the topic genuinely demands that artifact.
- Build hierarchy through scale, contrast, spacing, alignment, depth, rhythm, and composition before using frames, dividers, or containers.
- Keep supporting content clearly subordinate to the hero.
- Do not interpret structural restraint as permission to flatten the concept into a generic minimal layout.
- Do not use text-on-text layering, typographic collisions, or overlapping live text as a compositional device.

## Visual system
- Build one coherent visual world derived from the topic itself.
- Let the topic drive palette, contrast, typography, spacing, geometry, motifs, materials, and motion.
- Even restrained palettes must feel intentional and specific, not generic premium-neutral.
- The background must actively contribute mood, depth, and topic logic.
- If the topic suggests a real system language, physical behavior, or interface grammar, show that directly instead of generic abstract-tech decoration.
- Treat headline typography as part of the concept, not neutral text.
- The headline may use topic-derived color, selective emphasis, multi-tone treatment, or gradient accents when they strengthen the concept and remain readable.
- Do not default the headline to neutral black, white, or near-white unless that is clearly the strongest topic-native choice.

## Background and tonal diversity
- Premium and atmospheric design may be light, mid-tone, or dark; do not default to dark.
- Choose the tonal key from the topic, offer, audience, and style direction rather than from generic cinematic or tech aesthetics.
- Contrast may come from hue, saturation, temperature, texture, density, or scale, not only darkness.

## Proof and concept expression
- Prefer the minimum visual evidence needed to make the idea feel specific, credible, and native to the topic.
- If the concept is strongest with typography, atmosphere, and one precise gesture, do that.
- If a stronger proof artifact is justified, use one legible, unified artifact rather than multiple fragmented panels.
- Proof may take the form of a signal, trace, contour, command line, path, specimen, structural mark, scene fragment, or other topic-native evidence.
- Typography itself may carry part of the concept or proof.
- When appropriate, use one precise typographic gesture—such as selective word emphasis, chromatic offset, gradient emphasis, distortion, signal breakup, or structural interruption—to make the concept feel more specific and alive.
- Prefer one strong typographic intervention over many scattered decorative effects.
- Avoid decorative pseudo-proof.
- Avoid turning simple ideas into framed showcases, dashboard fragments, floating panels, softened slabs, or generic marketing geometry.

## Icons and symbolic language
- Icons are optional.
- Use icons only when they improve scanability, recognition, navigation, proof clarity, or support-cluster legibility.
- Prefer topic-native icon logic over generic startup glyphs.
- Keep icon style consistent in stroke weight, geometry, corner logic, and detail level.
- Use icons primarily in clearly secondary roles unless a single topic-native symbol is central to the concept.
- Do not let icons compete with the hero headline, proof artifact, or CTA hierarchy.

## Support cluster
- If used, show supporting highlights only once, in a single lower cluster beneath the hero.
- Each highlight should be short, fast to scan, and clearly secondary.
- Supporting highlights may use concise icons or symbolic marks when helpful.
- Support-cluster elements may use subtle motion when it improves scanability, continuity, or atmosphere and remains clearly secondary.
- Card-like grouping is allowed only inside this lower support cluster.
- These modules may use at most one light surface treatment, such as a subtle stroke, tonal fill, or very soft shadow.
- Keep support modules uniform, non-nested, and visually subordinate.
- Do not use card-like structures in the hero, proof, CTA area, or elsewhere on the page.

## Motion
- Motion is optional.
- Use motion only when it supports hierarchy, continuity, feedback, atmosphere, or topic logic.
- Default to none, minimal, or ambient motion depending on what the concept actually needs.
- Motion may live in typography, background behavior, proof logic, support-cluster behavior, or interaction feedback.
- A single key word or short phrase may use subtle text-based motion such as glitch, flicker, jitter, scanline shift, chromatic split, text scramble, pulse, or reveal if it strengthens the concept.
- Keep motion controlled, readable, non-blocking, and subordinate to clarity.
- Avoid scrolljacking, attention-hijacking loops, and ornamental animation.
- Respect reduced-motion preferences.

## Accessibility and readability
- Preserve strong readability and clear hierarchy at all viewport sizes.
- Maintain sufficient contrast between text and background.
- Do not place essential text over busy imagery unless readability remains strong.
- Avoid cramped spacing, visual collisions, and weak focal hierarchy.
- Do not place badges, pills, annotations, stickers, or floating interface fragments over essential text.
- If the deliverable is code, use semantic HTML structure, visible focus states, keyboard-friendly interactions, and reduced-motion handling.
- When in doubt, preserve legibility over expressive overlap.

## Anti-drift rules
- Do not drift into bland corporate SaaS styling.
- Do not default to dashboard aesthetics, feature-grid thinking, boxed-section composition, or template-like modularity.
- Do not use disconnected motifs, random color choices, or interchangeable abstract-tech shapes.
- Do not use card-within-card composition, nested surfaces, floating panels, fake proof, or stock-looking UI.
- Keep one visual world, one dominant hero, and one clear structural logic.
- Do not allow text, labels, or interface elements to overlap, collide, or sit on top of one another.

## Output
Return only the final existing HTML/CSS/JavaScript game.

If the deliverable is code:
- Output a complete production-ready file or component.
- Keep dependencies minimal unless explicitly requested.
- Make it responsive.
- Keep support highlights in one lower support cluster only when used.

## Final self-check
Before returning, verify that the result keeps:
- one dominant hero
- one coherent visual world
- no invented proof
- no cardification outside the lower support cluster
- no generic SaaS drift
- no unnecessary structural fragmentation
- no nested containment
- no floating sub-surfaces
- all text clearly legible and comfortably spaced
