# Markdown 고급 기능

## 개요

[[markdown.basics|Markdown 문법]]과 [[markdown.features|Markdown 편집기 기능]]을 숙지한 후에는 차트, 수학 공식, HTML 및 속성과 같은 확장 문법과 고급 기능을 사용하여 문서의 표현력을 풍부하게 할 수 있습니다.

<MenuItemsDemo mode="demo" :items='[{"id": "edit"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "view"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "insert"}]' />

<SearchReplaceMenu mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["outline", "preview"]' />

## 차트와 공식

### 차트 코드 블록

문서에서 코드 블록을 사용하여 Mermaid, PlantUML, ECharts 등의 차트를 삽입할 수 있으며, 편집기는 실시간으로 렌더링합니다:

- **Mermaid**: 플로우차트, 시퀀스 다이어그램, 클래스 다이어그램, 간트 차트 등. [[charts.mermaid|Mermaid 차트]] 참조
- **PlantUML**: UML 다이어그램 등. [[charts.plantuml|PlantUML 차트]] 참조
- **ECharts**: 데이터 시각화 차트. [[charts.echarts|ECharts 차트]] 참조

### 수학 공식

인라인 공식과 블록 수준 공식을 지원합니다:

- **인라인 공식**: `$...$` 또는 `\(...\)`
- **블록 수준 공식**: `$$...$$` 또는 `\[...\]`
- **다중 행 공식**: `aligned`, `equation` 등의 환경 사용

### LaTeX 공식 변환

편집기는 일부 LaTeX 공식 문법을 호환되는 Markdown/HTML 형식으로 변환하여 비 LaTeX 환경에서도 올바르게 표시되도록 합니다.

## 확장 문법

### 테이블 고급

- 정렬: 헤더 구분 행에서 `:---`, `:---:`, `---:`를 사용하여 좌측, 중앙, 우측 정렬 설정
- 병합: 복잡한 테이블은 HTML `<table>`을 통해 구현 가능
- 선택 영역에서 생성: 편집기에서 텍스트를 선택한 후, 마우스 오른쪽 버튼 또는 메뉴를 통해 빠르게 테이블 삽입 가능

### 링크와 이미지

- **참조식 링크**: `[텍스트][참조명]`, 문서 끝에 `[참조명]: URL` 정의
- **제목과 속성**: 일부 렌더러는 `(url "제목")` 또는 사용자 정의 속성을 지원
- **이미지 크기**: HTML `<img>` 또는 확장 문법을 통해 너비와 높이 설정 (렌더러 지원에 따라 다름)

### 각주

렌더러가 각주 확장을 지원하는 경우:

```markdown
본문 내용[^1].

[^1]: 각주 내용.
```

## 편집기 기능과 연동

### 마우스 오른쪽 버튼과 AI

- **문단 최적화**: 문단을 선택하고 마우스 오른쪽 버튼의 '문단 최적화' 또는 AI 교정 사용. [[features.paragraph-optimization|문단 최적화 기능]] 참조
- **차트 삽입**: 마우스 오른쪽 버튼 또는 AI 어시스턴트를 통해 Mermaid/ECharts 등의 코드 블록 삽입. [[charts.introduction|차트 기능 소개]] 참조

### 지식 베이스와 자동 완성

- [[knowledge-base.usage|지식 베이스]]를 활성화하면, AI 자동 완성 및 대화가 현재 문서와 지식 베이스 내용을 결합할 수 있습니다.
- [[ai.completion|AI 자동 완성]]에서 트리거 키와 최대 토큰을 설정하여 장문 작성 효율성을 높일 수 있습니다.

## 모범 사례

1. **기본 후 확장**: [[markdown.basics|기본 문법]]을 먼저 숙련한 후 차트와 공식 사용
2. **스타일 통일**: 동일 문서 내에서 차트 유형, 공식 작성법을 가능한 통일
3. **호환성**: PDF/HTML로 내보낼 때 차트와 공식의 호환성 주의
4. **성능**: 한 페이지 내에 너무 많거나 큰 차트는 미리보기 성능에 영향을 줄 수 있음

## 관련 문서

- [[markdown.basics|Markdown 문법]]
- [[markdown.features|Markdown 편집기 기능]]
- [[charts.introduction|차트 기능 소개]]
- [[ai.completion|AI 자동 완성]]
