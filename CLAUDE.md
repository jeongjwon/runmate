# RunMate

한국 마라톤 일정 조회, 참가 신청, 러닝 기록 관리를 위한 웹 애플리케이션.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 언어 | Go 1.26 |
| 웹 프레임워크 | Gin v1.12 |
| ORM | GORM v1.31 + SQLite (`runmate.db`) |
| 프론트엔드 | HTML 템플릿 (Go `html/template`) |
| CSS | Tailwind CSS (CDN) |
| 차트 | Chart.js (CDN) |
| 아이콘 | Font Awesome 6 (CDN) |

## 실행 방법

```bash
# 1. 의존성 설치 (최초 1회)
go mod tidy

# 2. 환경변수 설정
cp .env.example .env
# .env 파일을 열어 필요한 값 입력

# 3. 서버 실행
go run main.go
```

접속: http://localhost:8080

### 환경변수 (.env)

| 키 | 필수 | 설명 |
|----|------|------|
| `MARATHON_API_KEY` | 선택 | 공공데이터포털 서비스키. 미설정 시 시드 데이터만 사용 |
| `PORT` | 선택 | 서버 포트 (기본값: `8080`) |

> `.env` 파일은 `.gitignore`에 포함되어 있어 커밋되지 않는다.  
> 팀원과 공유할 때는 `.env.example`을 참고해 각자 `.env`를 만든다.

### 마라톤 데이터 동기화 (API 키 설정 후)

```bash
# data.go.kr '국내마라톤대회 정보' 활용신청 후 .env에 키 입력
# https://www.data.go.kr/data/15138980/fileData.do

curl -X POST http://localhost:8080/api/marathons/sync
```

---

## 디렉토리 구조

```
runmate/
├── main.go                  # 진입점, 라우팅 등록
├── go.mod / go.sum
├── runmate.db               # SQLite DB (자동 생성)
│
├── models/
│   ├── marathon.go          # Marathon, Registration 모델
│   └── record.go            # RunningRecord 모델 + Duration 유틸, Stats 구조체
│
├── handlers/
│   ├── marathon.go          # 마라톤 조회, 참가 신청/취소, 공공데이터 동기화
│   └── record.go            # 러닝 기록 CRUD, 통계 조회
│
├── services/
│   ├── marathon_api.go      # 공공데이터포털 API 호출 및 파싱
│   └── stats.go             # 주간/월간/연간 통계 집계 로직
│
├── repository/
│   └── db.go                # DB 초기화, AutoMigrate, 2026 마라톤 시드 데이터
│
└── templates/
    ├── layout.html          # 공통 레이아웃 (nav, 모바일 하단 탭바)
    ├── index.html           # 홈 (대시보드 요약)
    ├── marathons.html       # 마라톤 목록 + 참가 신청 모달
    ├── registrations.html   # 내 참가 신청 목록 + 취소
    ├── records.html         # 러닝 기록 CRUD + 통계 (탭 통합)
    └── stats.html           # /stats → /records 리다이렉트용 (미사용)
```

---

## 아키텍처

```
브라우저
  │
  │  GET /marathons  (HTML 페이지)
  ▼
main.go  ──▶  html/template.ParseFiles(layout.html + page.html)
              └─ ExecuteTemplate("layout.html")
                  └─ {{template "content" .}}  ← 각 페이지가 define

  │  GET /api/marathons  (JSON API)
  ▼
handlers/  ──▶  repository.DB (GORM)  ──▶  runmate.db (SQLite)
               └─ services/ (통계 집계, 외부 API 호출)
```

### 템플릿 렌더링 방식

Go 표준 `html/template`을 사용. 모든 페이지는 두 파일을 함께 파싱한다.

```go
t := template.ParseFiles("templates/layout.html", "templates/page.html")
t.ExecuteTemplate(c.Writer, "layout.html", nil)
```

- `layout.html`: `{{template "content" .}}` 자리를 포함한 공통 껍데기
- 각 페이지: `{{define "content"}} ... {{end}}`로 콘텐츠 정의

### 데이터 흐름 (기록 추가 예시)

```
사용자 입력 (H:MM:SS)
  │
  ▼
JS getDurationString() → "1:23:45"
  │
  ▼
POST /api/records  { duration: "1:23:45", ... }
  │
  ▼
handlers.CreateRecord
  ├─ models.ParseDuration("1:23:45") → 5025 (초)
  ├─ calcPace(distance, 5025)        → "6'42\""
  └─ repository.DB.Create(&record)
       │
       ▼
  AfterFind hook → DurationFormatted = "1:23:45"
  JSON 응답: { duration: 5025, duration_formatted: "1:23:45", pace: "6'42\"" }
```

---

## 데이터 모델

### Marathon

| 필드 | 타입 | 설명 |
|------|------|------|
| id | uint | PK |
| name | string | 대회명 |
| date | string | 개최일 (YYYY-MM-DD) |
| location | string | 개최 장소 (전체 주소) |
| city | string | 도시명 (필터용) |
| categories | string | 종목 ("5K,10K,Half,Full") |
| description | string | 대회 소개 |
| official_url | string | 공식 홈페이지 |
| entry_fee | int | 참가비 (원) |
| max_participants | int | 최대 참가 인원 |
| is_active | bool | 모집 중 여부 |

### Registration (참가 신청)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | uint | PK |
| marathon_id | uint | FK → Marathon |
| runner_name | string | 러너 이름 |
| email | string | 이메일 (선택) |
| category | string | 신청 종목 |
| status | string | `registered` / `cancelled` / `completed` |

### RunningRecord (러닝 기록)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | uint | PK |
| date | string | 날짜 (YYYY-MM-DD) |
| distance | float64 | 거리 (km) |
| duration | int | **총 초(seconds)** DB 저장값 |
| duration_formatted | string | `H:MM:SS` 형식 (계산값, DB 미저장) |
| pace | string | `M'SS"/km` 자동 계산 |
| heart_rate | int | 심박수 (bpm, 선택) |
| calories | int | 소모 칼로리 (선택) |
| route_type | string | `road` / `trail` / `track` / `treadmill` |
| weather | string | `sunny` / `cloudy` / `rainy` / `snowy` / `windy` |
| notes | string | 메모 |

> **Duration 저장 규칙**: DB에는 항상 총 초(seconds)로 저장. 입력/출력은 `HH:MM:SS` 또는 `MM:SS` 문자열.  
> `models.ParseDuration(str) → int`, `models.FormatDuration(sec) → str` 유틸 사용.

---

## API 엔드포인트

### 페이지 라우트

| URL | 설명 |
|-----|------|
| `GET /` | 홈 대시보드 |
| `GET /marathons` | 마라톤 목록 |
| `GET /registrations` | 내 참가 신청 |
| `GET /records` | 러닝 기록 & 통계 |
| `GET /stats` | `/records`로 301 리다이렉트 |

### JSON API

#### 마라톤

| 메서드 | URL | 설명 |
|--------|-----|------|
| GET | `/api/marathons` | 목록 조회 (`?city=서울&category=Full`) |
| GET | `/api/marathons/:id` | 상세 조회 (참가 신청 목록 포함) |
| POST | `/api/marathons/sync` | 공공데이터포털 동기화 (API 키 필요) |

#### 참가 신청

| 메서드 | URL | 설명 |
|--------|-----|------|
| GET | `/api/registrations` | 전체 신청 목록 |
| POST | `/api/registrations` | 신청 등록 |
| DELETE | `/api/registrations/:id` | 신청 취소 (status → cancelled) |

#### 러닝 기록

| 메서드 | URL | 설명 |
|--------|-----|------|
| GET | `/api/records` | 목록 (`?from=YYYY-MM-DD&to=YYYY-MM-DD`) |
| GET | `/api/records/:id` | 단건 조회 |
| POST | `/api/records` | 기록 추가 |
| PUT | `/api/records/:id` | 기록 수정 |
| DELETE | `/api/records/:id` | 기록 삭제 |

#### 통계

| 메서드 | URL | 설명 |
|--------|-----|------|
| GET | `/api/stats?period=weekly` | 최근 8주 통계 |
| GET | `/api/stats?period=monthly&year=2026` | 월별 통계 (연도 지정) |
| GET | `/api/stats?period=yearly` | 최근 3년 연간 통계 |

---

## 프론트엔드 페이지 구성

### `/records` — 기록 & 통계 (통합 페이지)

두 개의 내부 탭으로 구성.

**기록 탭**
- 전체 러닝 기록 목록 (날짜 내림차순)
- 상단 요약 배지: 총 횟수 / 총 거리 / 총 시간 / 평균 페이스
- 각 카드: 날짜, 거리, 시간(HH:MM:SS), 페이스, 코스유형, 심박수, 날씨, 메모
- 추가/수정 모달 (모바일에서 하단 sheet 방식)
- 수정·삭제 인라인 버튼

**통계 탭**
- 전체 요약 카드 4개: 총 횟수, 총 거리, 총 시간, 평균 페이스
- 주간: 최근 8주 바 차트 + 테이블 (거리/시간/횟수/페이스)
- 월간: 월별 바 차트 + 월 카드 12개 (거리/횟수/페이스)
- 연간: 연도 비교 바 차트 + 연도 카드 (거리/횟수/시간/페이스)

### `/marathons` — 마라톤 일정

- 도시 / 종목 필터
- 대회 카드: 이름, 날짜, 장소, 참가비, 종목 배지, 모집 상태
- 참가 신청 모달 (이름, 이메일, 종목 선택)

### `/registrations` — 내 신청 목록

- 신청 상태별 표시 (`신청완료` / `취소됨`)
- 취소 버튼 (status → cancelled, soft 처리)

---

## 주요 구현 주의사항

**GORM 모델 JSON 직렬화**  
`gorm.Model` 임베딩 시 `ID` 필드에 json 태그가 없어 `"ID"`(대문자)로 직렬화된다. JS에서 `record.id`(소문자)로 접근하면 `undefined`가 되므로, 모든 모델은 `gorm.Model` 대신 필드를 직접 선언하고 `json:"id"` 태그를 명시한다.

```go
// 올바른 방식
type RunningRecord struct {
    ID        uint           `gorm:"primarykey" json:"id"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
    ...
}
```

**Duration 단위**  
DB에는 항상 초(int)로 저장. 분 단위로 착각하지 않도록 주의.  
통계 집계 시 `totalDuration`은 초 단위이므로 시간 표시 변환 시 `÷ 3600` 사용.

**페이스 계산**  
`secsPerKm = durationSeconds / distanceKm` → `MM'SS"` 포맷.  
`services/stats.go`의 `calcPace`와 `handlers/record.go`의 `calcPace`가 동일 로직으로 중복 존재 (추후 공통 유틸로 통합 가능).

**마라톤 동기화**  
`MARATHON_API_KEY` 미설정 시 seed 데이터(2026 대회 8개)만 사용. API 키 설정 후 `POST /api/marathons/sync` 호출 시 공공데이터포털에서 최신 데이터를 가져와 upsert.

**DB 초기화**  
`runmate.db` 삭제 후 서버 재시작 시 AutoMigrate + 시드 데이터 자동 삽입.
