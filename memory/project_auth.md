---
name: Social Login Implementation
description: OAuth2 소셜 로그인 (Google/Kakao/Naver) 구현 현황
type: project
---

소셜 로그인(Google/Kakao/Naver) OAuth2 인증 기능 추가 완료.

**Why:** 비로그인 사용자는 마라톤 목록만 볼 수 있고, 참가신청/러닝기록은 회원만 가능하도록 제한

**How to apply:**
- 새 OAuth 앱 등록 시 `.env.example` 참고하여 `.env`에 키 설정 필요
- `SESSION_SECRET` 환경변수 반드시 설정 (미설정 시 기본값 사용되어 보안 취약)
- 각 OAuth 앱의 Callback URL을 정확히 설정해야 로그인 동작

추가된 파일:
- `models/user.go` — User 모델 (Provider+ProviderID unique 인덱스)
- `handlers/auth.go` — OAuth2 핸들러, 세션 미들웨어, RequireAuth/RequireAuthPage
- `templates/login.html` — 소셜 로그인 선택 페이지

변경된 파일:
- `models/marathon.go` — Registration에 UserID 추가
- `models/record.go` — RunningRecord에 UserID 추가
- `repository/db.go` — User AutoMigrate 추가
- `services/stats.go` — GetWeeklyStats/GetMonthlyStats/GetYearlyStats에 userID 파라미터 추가
- `handlers/record.go` — 모든 CRUD에 로그인 유저 필터링
- `handlers/marathon.go` — 참가신청 CRUD에 로그인 유저 필터링
- `main.go` — 인증 라우트 및 미들웨어 등록, TemplateData로 User 전달
- `templates/layout.html` — 로그인/프로필/로그아웃 UI
- `templates/marathons.html` — 비로그인 시 "로그인 후 신청" 버튼
- `templates/index.html` — 로그인 상태에 따른 대시보드/소개 분기
