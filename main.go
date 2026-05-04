package main

import (
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"os"
	"runmate/handlers"
	"runmate/models"
	"runmate/repository"
	"runmate/services"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func migrateWishToParticipation() {
	migrator := repository.DB.Migrator()
	if migrator.HasTable("marathon_wishes") && !migrator.HasTable("marathon_participations") {
		repository.DB.Exec("ALTER TABLE marathon_wishes RENAME TO marathon_participations")
	}
}

func migrateCityToSido() {
	oldToNew := map[string]string{
		"서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시",
		"인천": "인천광역시", "광주": "광주광역시", "대전": "대전광역시",
		"울산": "울산광역시", "세종": "세종특별자치도", "제주": "제주특별자치도",
		"경기": "경기도", "강원": "강원특별자치도",
		"충북": "충청북도", "충남": "충청남도",
		"전북": "전라북도", "전남": "전라남도",
		"경북": "경상북도", "경남": "경상남도",
		"춘천": "강원특별자치도", "원주": "강원특별자치도", "강릉": "강원특별자치도",
		"태백": "강원특별자치도", "속초": "강원특별자치도", "삼척": "강원특별자치도",
		"경주": "경상북도", "포항": "경상북도", "안동": "경상북도", "구미": "경상북도",
		"창원": "경상남도", "진주": "경상남도", "통영": "경상남도",
		"거제": "경상남도", "김해": "경상남도", "양산": "경상남도",
		"전주": "전라북도", "군산": "전라북도", "익산": "전라북도",
		"목포": "전라남도", "여수": "전라남도", "순천": "전라남도",
		"나주": "전라남도", "광양": "전라남도",
		"청주": "충청북도", "충주": "충청북도", "제천": "충청북도",
		"천안": "충청남도", "아산": "충청남도", "공주": "충청남도",
		"수원": "경기도", "고양": "경기도", "성남": "경기도",
		"화성": "경기도", "용인": "경기도", "파주": "경기도",
	}

	var marathons []models.Marathon
	repository.DB.Find(&marathons)
	for _, m := range marathons {
		newCity := services.ExtractCity(m.Location)
		if newCity == "" {
			if mapped, ok := oldToNew[m.City]; ok {
				newCity = mapped
			}
		}
		if newCity != "" && newCity != m.City {
			repository.DB.Model(&m).Update("city", newCity)
		}
	}
}

var funcMap = template.FuncMap{
	"json": func(v interface{}) template.JS {
		b, _ := json.Marshal(v)
		return template.JS(b)
	},
}

func parsePage(files ...string) *template.Template {
	return template.Must(
		template.New("layout.html").Funcs(funcMap).ParseFiles(files...),
	)
}

func renderPage(c *gin.Context, files ...string) {
	t := parsePage(files...)
	c.Status(http.StatusOK)
	c.Header("Content-Type", "text/html; charset=utf-8")
	t.ExecuteTemplate(c.Writer, "layout.html", handlers.TemplateData{
		User: handlers.GetCurrentUser(c),
	})
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println(".env 파일 없음 — 환경변수를 직접 사용합니다")
	}

	repository.InitDB()         // DB 연결
	migrateWishToParticipation() // wishes → participations 테이블 rename
	migrateCityToSido()          // 지역명 시도 단위 정규화
	handlers.InitAuth()          // 로그인 세션 정보 저장

	go func() {
		result, err := services.CrawlAndSyncMarathons() // 마라톤 데이터 크롤링
		if err != nil {
			log.Printf("자동 크롤링 실패: %v", err)
		} else {
			log.Printf("자동 크롤링 완료: %s", result.Message)
		}
	}()

	r := gin.Default() // gin 서버 생성 (r이 모든 주소 관리)
	r.SetFuncMap(funcMap)
	r.Static("/static", "./static") // 정적 파일 연결 (파비콘, css, js ,,,)

	// ── 인증 미들웨어 (모든 요청에 적용: 세션에서 유저 로드) ──────────────────
	r.Use(handlers.AuthMiddleware())

	// ── 인증 라우트 ───────────────────────────────────────────────────────────
	// 소셜 로그인 (구글,카카오,네이버)
	r.GET("/login", func(c *gin.Context) {
		renderPage(c, "templates/layout.html", "templates/login.html")
	})
	r.GET("/auth/google", handlers.GoogleLogin)
	r.GET("/auth/google/callback", handlers.GoogleCallback)
	r.GET("/auth/kakao", handlers.KakaoLogin)
	r.GET("/auth/kakao/callback", handlers.KakaoCallback)
	r.GET("/auth/naver", handlers.NaverLogin)
	r.GET("/auth/naver/callback", handlers.NaverCallback)
	r.POST("/auth/logout", handlers.Logout)

	// ── 페이지 라우트 (공개) ──────────────────────────────────────────────────
	r.GET("/", func(c *gin.Context) {
		renderPage(c, "templates/layout.html", "templates/marathons.html")
	})
	// 마라톤 목록
	r.GET("/marathons", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/")
	})

	// ── 페이지 라우트 (로그인 필요) ───────────────────────────────────────────
	// 참가 신청 페이지
	r.GET("/participations", handlers.RequireAuthPage(), func(c *gin.Context) {
		renderPage(c, "templates/layout.html", "templates/registrations.html")
	})
	r.GET("/registrations", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/participations")
	})
	// 기록 페이지
	r.GET("/records", handlers.RequireAuthPage(), func(c *gin.Context) {
		renderPage(c, "templates/layout.html", "templates/records.html")
	})
	// 통계 페이지
	r.GET("/stats", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/records")
	})

	// ── API 라우트 ────────────────────────────────────────────────────────────
	api := r.Group("/api")
	{
		api.GET("/me", handlers.GetMe)

		// 마라톤 (공개)
		api.GET("/marathons", handlers.GetMarathons)
api.GET("/marathons/:id", handlers.GetMarathon)
		api.POST("/marathons/sync", handlers.SyncMarathons)
		api.POST("/marathons/crawl", handlers.CrawlMarathons)

		// 참여 마라톤
		api.GET("/participations", handlers.GetParticipations)
		api.POST("/participations/:marathon_id", handlers.RequireAuth(), handlers.ToggleParticipation)
		api.PUT("/participations/:marathon_id/record", handlers.RequireAuth(), handlers.UpdateParticipationRecord)

		// 러닝 기록 (인증 필요)
		api.GET("/records", handlers.GetRecords)
		api.GET("/records/:id", handlers.GetRecord)
		api.POST("/records", handlers.RequireAuth(), handlers.CreateRecord)
		api.PUT("/records/:id", handlers.RequireAuth(), handlers.UpdateRecord)
		api.DELETE("/records/:id", handlers.RequireAuth(), handlers.DeleteRecord)

		// 통계
		api.GET("/stats", handlers.GetStats)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	r.Run(":" + port)
}
