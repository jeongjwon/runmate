package main

import (
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

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println(".env 파일 없음 — 환경변수를 직접 사용합니다")
	}

	repository.InitDB()

	go func() {
		result, err := services.CrawlAndSyncMarathons()
		if err != nil {
			log.Printf("자동 크롤링 실패: %v", err)
		} else {
			log.Printf("자동 크롤링 완료: %s", result.Message)
		}
	}()

	r := gin.Default()

	// 공통 레이아웃 + 각 페이지 템플릿을 함께 파싱
	r.SetFuncMap(template.FuncMap{})

	r.GET("/", func(c *gin.Context) {
		t := template.Must(template.ParseFiles("templates/layout.html", "templates/index.html"))
		c.Status(http.StatusOK)
		c.Header("Content-Type", "text/html; charset=utf-8")
		t.ExecuteTemplate(c.Writer, "layout.html", nil)
	})

	r.GET("/marathons", func(c *gin.Context) {
		t := template.Must(template.ParseFiles("templates/layout.html", "templates/marathons.html"))
		c.Status(http.StatusOK)
		c.Header("Content-Type", "text/html; charset=utf-8")
		t.ExecuteTemplate(c.Writer, "layout.html", nil)
	})

	r.GET("/registrations", func(c *gin.Context) {
		t := template.Must(template.ParseFiles("templates/layout.html", "templates/registrations.html"))
		c.Status(http.StatusOK)
		c.Header("Content-Type", "text/html; charset=utf-8")
		t.ExecuteTemplate(c.Writer, "layout.html", nil)
	})

	r.GET("/records", func(c *gin.Context) {
		t := template.Must(template.ParseFiles("templates/layout.html", "templates/records.html"))
		c.Status(http.StatusOK)
		c.Header("Content-Type", "text/html; charset=utf-8")
		t.ExecuteTemplate(c.Writer, "layout.html", nil)
	})

	// /stats → /records 리다이렉트 (통계가 기록 페이지에 통합됨)
	r.GET("/stats", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/records")
	})

	// API 라우트
	api := r.Group("/api")
	{
		// 마라톤
		api.GET("/marathons", handlers.GetMarathons)
		api.GET("/marathons/cities", handlers.GetCities)
		api.GET("/marathons/:id", handlers.GetMarathon)
		api.POST("/marathons/sync", handlers.SyncMarathons)
		api.POST("/marathons/crawl", handlers.CrawlMarathons)

		// 참가 신청
		api.GET("/registrations", handlers.GetRegistrations)
		api.POST("/registrations", handlers.CreateRegistration)
		api.DELETE("/registrations/:id", handlers.CancelRegistration)

		// 러닝 기록
		api.GET("/records", handlers.GetRecords)
		api.GET("/records/:id", handlers.GetRecord)
		api.POST("/records", handlers.CreateRecord)
		api.PUT("/records/:id", handlers.UpdateRecord)
		api.DELETE("/records/:id", handlers.DeleteRecord)

		// 통계
		api.GET("/stats", handlers.GetStats)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	r.Run(":" + port)
}
