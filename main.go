package main

import (
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"os"
	"runmate/handlers"
	"runmate/repository"
	"runmate/services"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

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

	repository.InitDB()
	handlers.InitAuth()

	go func() {
		result, err := services.CrawlAndSyncMarathons()
		if err != nil {
			log.Printf("자동 크롤링 실패: %v", err)
		} else {
			log.Printf("자동 크롤링 완료: %s", result.Message)
		}
	}()

	r := gin.Default()
	r.SetFuncMap(funcMap)
	r.Static("/static", "./static")

	// ── 인증 미들웨어 (모든 요청에 적용: 세션에서 유저 로드) ──────────────────
	r.Use(handlers.AuthMiddleware())

	// ── 인증 라우트 ───────────────────────────────────────────────────────────
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
	r.GET("/marathons", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/")
	})

	// ── 페이지 라우트 (로그인 필요) ───────────────────────────────────────────
	r.GET("/registrations", handlers.RequireAuthPage(), func(c *gin.Context) {
		renderPage(c, "templates/layout.html", "templates/registrations.html")
	})
	r.GET("/records", handlers.RequireAuthPage(), func(c *gin.Context) {
		renderPage(c, "templates/layout.html", "templates/records.html")
	})

	r.GET("/stats", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/records")
	})

	// ── API 라우트 ────────────────────────────────────────────────────────────
	api := r.Group("/api")
	{
		api.GET("/me", handlers.GetMe)

		// 마라톤 (공개)
		api.GET("/marathons", handlers.GetMarathons)
		api.GET("/marathons/cities", handlers.GetCities)
		api.GET("/marathons/:id", handlers.GetMarathon)
		api.POST("/marathons/sync", handlers.SyncMarathons)
		api.POST("/marathons/crawl", handlers.CrawlMarathons)

		// 참여 마라톤
		api.GET("/wishes", handlers.GetWishes)
		api.POST("/wishes/:marathon_id", handlers.RequireAuth(), handlers.ToggleWish)
		api.PUT("/wishes/:marathon_id/record", handlers.RequireAuth(), handlers.UpdateWishRecord)

		// 참가 신청 (목록은 로그인 사용자 기준, 변경은 인증 필요)
		api.GET("/registrations", handlers.GetRegistrations)
		api.POST("/registrations", handlers.RequireAuth(), handlers.CreateRegistration)
		api.DELETE("/registrations/:id", handlers.RequireAuth(), handlers.CancelRegistration)

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
