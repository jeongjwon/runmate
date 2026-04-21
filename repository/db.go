package repository

import (
	"log"
	"runmate/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB() {
	var err error
	DB, err = gorm.Open(sqlite.Open("runmate.db"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatal("DB 연결 실패:", err)
	}

	err = DB.AutoMigrate(
		&models.Marathon{},
		&models.Registration{},
		&models.RunningRecord{},
	)
	if err != nil {
		log.Fatal("DB 마이그레이션 실패:", err)
	}

	seedMarathons()
}

func seedMarathons() {
	var count int64
	DB.Model(&models.Marathon{}).Count(&count)
	if count > 0 {
		return
	}

	marathons := []models.Marathon{
		// ── 2026 상반기 ──────────────────────────────────────────
		{
			Name:            "2026 서울국제마라톤 (동아마라톤)",
			Date:            "2026-03-15",
			Location:        "서울 광화문광장 ~ 잠실올림픽주경기장",
			City:            "서울",
			Categories:      "10K,Half,Full",
			Description:     "국내 최대 규모 마라톤. 세계 6대 메이저를 꿈꾸는 엘리트 선수와 시민 러너가 함께 달립니다.",
			OfficialURL:     "https://www.donga-marathon.com",
			EntryFee:        50000,
			MaxParticipants: 30000,
		},
		{
			Name:            "2026 대구국제마라톤",
			Date:            "2026-04-05",
			Location:        "대구스타디움",
			City:            "대구",
			Categories:      "5K,10K,Half,Full",
			Description:     "평탄한 코스로 기록 달성에 최적. 봄 대구를 달리는 대표 마라톤입니다.",
			OfficialURL:     "https://www.daegumarathon.co.kr",
			EntryFee:        38000,
			MaxParticipants: 12000,
		},
		{
			Name:            "2026 경주국제마라톤",
			Date:            "2026-04-12",
			Location:        "경주종합운동장",
			City:            "경주",
			Categories:      "5K,10K,Half,Full",
			Description:     "유네스코 세계문화유산을 코스로 달리는 역사의 도시 경주 마라톤.",
			OfficialURL:     "https://www.gyeongjumarathon.com",
			EntryFee:        40000,
			MaxParticipants: 15000,
		},
		{
			Name:            "2026 제주국제마라톤",
			Date:            "2026-05-10",
			Location:        "제주종합경기장",
			City:            "제주",
			Categories:      "5K,10K,Half,Full",
			Description:     "한라산과 바다를 배경으로 달리는 제주의 봄. 국내외 러너들에게 인기 있는 코스입니다.",
			OfficialURL:     "https://www.jejumarathon.com",
			EntryFee:        45000,
			MaxParticipants: 10000,
		},
		// ── 2026 하반기 ──────────────────────────────────────────
		{
			Name:            "2026 춘천마라톤",
			Date:            "2026-10-25",
			Location:        "춘천종합운동장",
			City:            "춘천",
			Categories:      "10K,Half,Full",
			Description:     "의암호를 끼고 달리는 단풍 코스. 국내 최고의 가을 마라톤으로 꼽힙니다.",
			OfficialURL:     "https://www.chuncheonmarathon.org",
			EntryFee:        45000,
			MaxParticipants: 20000,
		},
		{
			Name:            "2026 조선일보 춘천마라톤",
			Date:            "2026-11-01",
			Location:        "춘천 봄내체육관",
			City:            "춘천",
			Categories:      "5K,10K,Half,Full",
			Description:     "60년 이상의 전통을 자랑하는 유서깊은 마라톤 대회.",
			OfficialURL:     "https://marathon.chosun.com",
			EntryFee:        40000,
			MaxParticipants: 18000,
		},
		{
			Name:            "2026 JTBC 서울마라톤",
			Date:            "2026-11-08",
			Location:        "잠실올림픽주경기장",
			City:            "서울",
			Categories:      "10K,Half,Full",
			Description:     "가을 서울의 도심을 달리는 야간 마라톤. 초보자부터 고수까지 모두 환영합니다.",
			OfficialURL:     "https://www.jtbcmarathon.com",
			EntryFee:        55000,
			MaxParticipants: 25000,
		},
		{
			Name:            "2026 부산국제마라톤",
			Date:            "2026-11-22",
			Location:        "부산아시아드주경기장",
			City:            "부산",
			Categories:      "10K,Half,Full",
			Description:     "광안대교와 해운대 해변을 달리는 바다 도시의 마라톤.",
			OfficialURL:     "https://www.busanmarathon.org",
			EntryFee:        42000,
			MaxParticipants: 15000,
		},
	}

	DB.Create(&marathons)
}
