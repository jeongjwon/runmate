## 추가 기능

[X] 로그인(소셜로그인)
[X] 파비콘 변경
[X] 마라톤 참여여부 추가
[X] UI/UX 대폭 수정
[X] 목록 페이지 변경
[X] 마라톤 크롤링 -> 지역 분배 or 지도 사용? -> 지역 분배
[X] registeration 한 대회 + 기록증(사진) 추가
[X] records 추가 -> csv 로 데이터 파싱을 통해 기록 추가 할 수 있도록
[X] records 카드 (NRC 스타일 활동 페이지로 통합 재설계)
[X] react + typescript + next.js + Prisma 로 변경 (+추후에 Drizzle 고민)
[X] 검색 필터
[X] records > activities 로 테이블명 변경
[X] 비로그인 유저 마라톤 추가시 500 에러

[X] 1. 로그인은 로그인 화면이 아니라 모달로 띄워서 + 배경은 흐리게
[X] 2. 스낵바 - 우측 상단에 알림 느낌으로 되게
[X] 3. activities 테이블 scroll
[X] 4. 상세 activity
[X] 5. 통계 - 월간 마일스톤 배지 (50km 단위당) , 활동 히트맵 -> 깃허브 or 캘린더 , 최고기록 (최장거리, 최고페이스, 최장시간)
[X] 6. 배지 - badges, user_badges

[ ] 하단 푸터 - 소개 | 문의 | 개인정보처리방침 | 이용약관
[ ] 서비스 소개 페이지 생성
[ ] 문의 페이지 생성
[ ] 개인정보 처리방침 페이지 생성
[ ] 이용약관 페이지 생성
[ ] 마라톤 - 페이지 네이션
[ ] 우측 상단 - 알림 + 프로필
[ ] 프로필에 뭐가 있으면 좋을까,,,?

## 변경 사항

[X] wishes + registerations -> participations 으로 통합
[X] registeration 참가 신청 삭제 필요

## 에러

[X] 에러 particiations POST + 기록 추가 -> DELETE -> POST -> 기록이 남아있음

## 개선

[ ] 공공데이터포털 API 사용하나 ? -> 사용안해
[ ] 크롤링 329개 + 구 시드 데이터 8개 + 공공데이터 API 0개
[ ] ai_parser.go 사용하나?
[ ] 조회 성능 향상

[X] docs 폴더 내 architecture.md , auth.md, data-layer.md, db-plan.md, db.md, seo.md 생성
[x] seo , og 적용
[ ] sql 문은 어디서?
