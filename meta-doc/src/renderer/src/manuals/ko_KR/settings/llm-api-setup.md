# LLM API 설정 가이드 ✨

MetaDoc에서 채팅, 교정, 에이전트를 쓰려면 설정에 **동작하는 LLM API**가 있어야 합니다 📡. 이 문서는 개념 → MetaDoc에 무엇을 입력할지 → 일반적인 공급자 활성화 → 문제 해결 → 초보자 FAQ 순으로 설명합니다.

> **⚠️ 면책**: 로컬 **Ollama** 🦙를 제외하고 OpenRouter, OpenAI, Google, Alibaba Cloud, DeepSeek, **4sapi** 같은 집계 서비스는 **제3자 서비스**입니다. 과금, 규정 준수, 계정 보안, 개인정보는 이용자와 해당 공급자 간의 책임이며, MetaDoc은 호환 요청을 보내는 클라이언트일 뿐입니다.

## 📋 한눈에 비교: 공급자 유형


| 유형 | 아이콘 | 적합한 사용자 👤 | 장점 ✨ | 트레이드오프 ⚖️ |
| :--- | :---: | :--- | :--- | :--- |
| **내장 무료(OpenRouter)** | ![OpenRouter](https://www.google.com/s2/favicons?domain=openrouter.ai&sz=64) | 처음 써보기 | 🎁 설정 없이—자체 키 없이 시도 | 📉 매우 작은 할당량, 속도 제한 가능—본업은 자체 키 |
| **OpenAI 호환** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | 게이트웨이, OpenRouter, 지역 미러 | 🔧 가장 유연: Base URL + 키 + 모델 | 📚 “호환” 품질은 다름—문서로 확인 |
| **OpenAI 공식** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | 공식 OpenAI 과금 | 🚀 최신 모델, 성숙한 생태계 | 💳 가격·지역 정책은 OpenAI 기준 |
| **DeepSeek** | ![DeepSeek](https://www.google.com/s2/favicons?domain=deepseek.com&sz=64) | 비용 민감, 중국어 중심 워크플로 | 💰 가성비, 단순 API | ⏱️ 할당량·속도 제한은 콘솔 기준—키 보호 |
| **Google Gemini** | ![Gemini](https://www.google.com/s2/favicons?domain=ai.google.dev&sz=64) | 멀티모달 / Google 스택 | 🖼️ 넓은 모델군, 빠른 업데이트 | 🌍 Google 계정·API 정책, 지역은 Google 기준 |
| **Qwen(DashScope)** | ![Alibaba](https://www.google.com/s2/favicons?domain=aliyun.com&sz=64) | 중국 리전 안정, 엔터프라이즈 | 🇨🇳 낮은 지연, 중국어 강함 | ☁️ 올바른 DashScope 제품 활성화, 엔드포인트·리전 일치 |
| **Ollama(로컬)** | ![Ollama](https://www.google.com/s2/favicons?domain=ollama.com&sz=64) | 프라이버시 / 오프라인에 가까운 사용 | 🔒 토큰당 클라우드 과금 없음(전력·HW는 별도) | 💾 디스크·GPU 부담, CPU만이면 느림, 작은 모델은 약할 수 있음 |

**한 줄로 선택**: **편의와 최신 모델** → 클라우드 공식 또는 호환 집계 ☁️; **비용·중국어** → DeepSeek, Qwen 등 💰; **프라이버시·제어** → Ollama—하드웨어·능력의 대가 🦙; **먼저 무료로** → 내장 무료 경로—일상 고부하는 기대하지 말 것 🎁.

---

## 🧭 MetaDoc에서 할 일 세 가지

<SettingLlmSection mode="demo" />

1. **프로필 선택 또는 생성**(OpenAI 호환 또는 DeepSeek로 시작해도 됨)🃏.
2. **API 키** 🔑 붙여넣기, 필요 시 **Base URL**과 **모델** ID.
3. **설정 확인** ✅를 눌러 연결·인증 점검.

---

## 🌐 트랙 A — OpenRouter(원스톱, OpenAI 호환)

OpenRouter는 하나의 **OpenAI 호환** Base URL 뒤에 여러 모델을 묶습니다—기억할 주소를 하나로 두고 싶을 때 편함 🎯.

### 1️⃣ 가입

[OpenRouter](https://openrouter.ai/)를 열고 계정을 만듭니다.

### 2️⃣ API 키 생성

[Keys](https://openrouter.ai/settings/keys)에서 키를 만들고 **안전한 곳에 복사**(많은 공급자는 전체 비밀을 한 번만 표시)📋.

### 3️⃣ MetaDoc 입력

**OpenAI 호환** 선택, **Base URL**을 `https://openrouter.ai/api/v1`로 설정하고 키를 붙이며 **모델**은 `openrouter/free` 또는 카탈로그의 모델 ID. 참고: [OpenRouter 문서](https://openrouter.ai/docs/), [무료 라우터](https://openrouter.ai/openrouter/free).

무료 경로에도 일일 상한·대기열이 있을 수 있음 ⏳. 본 운영에서는 콘솔의 **잔액·속도 제한**을 확인하세요.

---

## 🐋 트랙 B — DeepSeek(가성비)

### 1️⃣ 콘솔

[deepseek.com](https://www.deepseek.com/)에 로그인하고 콘솔의 API 섹션을 엽니다.

### 2️⃣ API 키

**API keys**(또는 동등) 페이지에서 키를 만들고 안전하게 보관 🔐.

### 3️⃣ MetaDoc 필드

**DeepSeek** 선택, 키 붙이기, 모델은 최신 [API 문서](https://api-docs.deepseek.com/)에 따라 `deepseek-chat` 또는 `deepseek-reasoner`.

---

## 🔗 트랙 C — 4sapi 등 집계(OpenAI 호환)

대개 OpenAI와 같은 URL 형태(`.../v1/chat/completions`) 🌏. [4sapi 문서(Apifox)](https://4sapi.apifox.cn/)에서 가격·엔드포인트를 읽고 키를 만들며 문서대로 **Base URL**과 **모델 ID**를 복사. MetaDoc에서는 **OpenAI 호환**을 고르고 각 필드를 붙입니다. 규칙은 자주 바뀜—**벤더 콘솔을 기준**으로 하고 **키를 보호** ⚠️.

---

## 🦙 트랙 D — Ollama(로컬)

### 1️⃣ 설치

[ollama.com](https://ollama.com/)에서 받아 앱이 실행되는지 확인.

### 2️⃣ 모델 pull

예: `ollama pull llama3.1`(현재 모델명은 사이트 확인). 모델 용량이 큼—디스크 여유 💾.

### 3️⃣ MetaDoc 설정

**Ollama** 선택, 베이스 `http://localhost:11434/api`, **모델**은 pull한 이름. 디스크리트 GPU가 큰 도움 🎮; CPU만이면 긴 답변이 느림. 자세한 내용은 [Ollama GitHub](https://github.com/ollama/ollama).

---

## ☁️ 트랙 E — Alibaba Qwen / DashScope

[DashScope 도움말](https://help.aliyun.com/zh/dashscope/)에 따라 **DashScope**를 켜고 API 키를 만듭니다. MetaDoc에서 **Qwen**을 선택하고 콘솔에 표시된 **OpenAI 호환** Base URL과 올바른 모델명·해당 시 리전을 입력.

---

## 🔷 트랙 F — Google Gemini

[Google AI for Developers](https://ai.google.dev/)(또는 Cloud 콘솔 흐름)에서 API 키 생성. MetaDoc **Gemini**에서 현재 모델 목록에 맞게 키와 모델 ID 입력.

---

## 🧯 문제 해결

- **401 / 403** 🔐: 키 오류, 모델 권한 없음, 프로젝트 미승인.
- **402 / 과금** 💳: 크레딧 충전 또는 자금 있는 키로 전환.
- **429** ⏱️: 속도 제한—나중에 재시도, 동시성 줄이기, 플랜 업그레이드.
- **502 / 게이트웨이** 🌐: 업스트림 또는 네트워크—재시도 또는 경로 변경.
- **빈 출력 / JSON 오류** 🧩: Base URL(`/v1` 포함), 모델 ID 철자, 사내 프록시·방화벽 재확인.

---

## ❓ FAQ

### API 키는 무엇에 쓰이나요? 🔑

공급자가 과금·승인에 쓰는 **자격 증명**입니다. MetaDoc은 설정한 엔드포인트로만 보냅니다. 공개 공유나 저장소 커밋 금지; 유출 시 할당량·과금이 탈취될 수 있습니다.

### 과금은? 토큰은? 💰

대부분 클라우드 API는 **토큰**(모델 토크나이저 이후의 텍스트 단위)으로 과금. 입력·출력은 별도 가격인 경우가 많음. **요율·무료 한도·번들**은 각 벤더 가격 페이지 참고. MetaDoc은 모델 접근을 재판매하지 않음. 로컬 Ollama는 보통 토큰당 클라우드 과금 없지만 전기·하드웨어는 듦.

### Base URL이란? 🔗

클라이언트가 호출하는 **HTTP 접두사**(호스트 + 경로). “OpenAI 호환”에서 공급자만 바꿀 때는 보통 Base URL + 모델 ID만 변경; 오타는 잘못된 서비스나 404/401로 이어짐.

### 왜 “무제한” 클라우드 모델이 기본 포함되지 않나요? ☁️

추론에는 비용이 있고 지역 정책을 지켜야 합니다. MetaDoc은 **클라이언트**로, 라이선스 공급자를 직접 선택·지불하게 합니다. 향후 공식 에이전트를 통한 대규모 모델 서비스가 나올 수 있습니다.

### 내장 무료 체험 vs 내 키 🎁

체험은 보통 **작은 할당량**에 대기·스로틀이 있을 수 있음. 자체 키는 해당 벤더와의 계약에 묶임—일상 업무에 적합.

### 문서 텍스트는 어디로? 🔒

**클라우드 API**는 선택한 공급자(및 **그들**의 개인정보처리방침에 적힌 하위처리자)로 감. **로컬 Ollama**를 localhost에 묶으면 내용은 보통 기기에 남지만 OS·네트워크 설정에 따름—신뢰할 수 없는 네트워크에서 비밀 전송 자제.

### HTTP 오류와 “설정 확인” 실패는 같나요? 🧪

항상은 아님. **설정 확인**은 여러 프로브를 실행; 단순 **401/429**는 위 목록에 해당. 여러 항목 실패 시 키·Base URL·모델 ID를 함께 재검증.

### Ollama vs 클라우드 ⚖️

**Ollama** 🦙는 프라이버시·오프라인에 가까운 사용, 속도·품질 타협 수용 시. **클라우드** ☁️는 최신 대형 모델·안정 처리량, 과금·약관 수용 시.

### 한 키를 여러 PC에서? 💻

기술적으로는 종종 가능하지만 **할당량·속도 제한은 공유**. 일부 공급자는 공유·IP 제한—약관 준수. 팀은 별도 키나 IAM 스타일 정책 권장.

### VPN이 필요한가요? 🌍

**어떤 공급자**와 **네트워크**에 따라 다름. 일부 국제 엔드포인트는 불안정하거나 차단될 수 있음—직접 연결을 테스트하고 현지 규정을 준수하세요.

---

첫 설정은 계정과 긴 문자열 복사가 필요하지만, 익숙해지면 “새 공급자 → 새 Base URL + 모델”이 대부분입니다 ✨. 필요에 맞는 스택 연결을 응원합니다 🎉.
