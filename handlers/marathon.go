package handlers

import (
	"net/http"
	"runmate/models"
	"runmate/repository"
	"runmate/services"

	"github.com/gin-gonic/gin"
)

func GetMarathons(c *gin.Context) {
	var marathons []models.Marathon
	query := repository.DB.Order("date ASC")

	if city := c.Query("city"); city != "" {
		query = query.Where("city = ?", city)
	}
	if category := c.Query("category"); category != "" {
		query = query.Where("categories LIKE ?", "%"+category+"%")
	}
	if search := c.Query("search"); search != "" {
		like := "%" + search + "%"
		query = query.Where("name LIKE ? OR location LIKE ?", like, like)
	}

	query.Find(&marathons)
	c.JSON(http.StatusOK, gin.H{"data": marathons})
}


func GetMarathon(c *gin.Context) {
	var marathon models.Marathon
	if err := repository.DB.First(&marathon, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "마라톤을 찾을 수 없습니다"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": marathon})
}

func SyncMarathons(c *gin.Context) {
	result, err := services.SyncMarathonsFromAPI()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
			"hint":  "data.go.kr에서 '국내마라톤대회 정보' 데이터셋 활용신청 후 MARATHON_API_KEY 환경변수를 설정하세요.",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

func CrawlMarathons(c *gin.Context) {
	result, err := services.CrawlAndSyncMarathons()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
			"hint":  ".env에 ANTHROPIC_API_KEY를 설정하세요. Anthropic Console(console.anthropic.com)에서 발급할 수 있습니다.",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}
