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

func GetCities(c *gin.Context) {
	var cities []string
	repository.DB.Model(&models.Marathon{}).
		Where("city != ''").
		Distinct("city").
		Order("city ASC").
		Pluck("city", &cities)
	c.JSON(http.StatusOK, gin.H{"data": cities})
}

func GetMarathon(c *gin.Context) {
	var marathon models.Marathon
	if err := repository.DB.Preload("Registrations").First(&marathon, c.Param("id")).Error; err != nil {
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

func GetRegistrations(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusOK, gin.H{"data": []models.Registration{}})
		return
	}
	var registrations []models.Registration
	repository.DB.Preload("Marathon").
		Where("user_id = ?", user.ID).
		Order("created_at DESC").
		Find(&registrations)
	c.JSON(http.StatusOK, gin.H{"data": registrations})
}

func CreateRegistration(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "로그인이 필요합니다"})
		return
	}

	var input struct {
		MarathonID uint   `json:"marathon_id" binding:"required"`
		RunnerName string `json:"runner_name" binding:"required"`
		Email      string `json:"email"`
		Category   string `json:"category" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var marathon models.Marathon
	if err := repository.DB.First(&marathon, input.MarathonID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "마라톤을 찾을 수 없습니다"})
		return
	}

	var existing models.Registration
	if err := repository.DB.Where("marathon_id = ? AND user_id = ? AND status != 'cancelled'",
		input.MarathonID, user.ID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "이미 신청한 마라톤입니다"})
		return
	}

	reg := models.Registration{
		UserID:     &user.ID,
		MarathonID: input.MarathonID,
		RunnerName: input.RunnerName,
		Email:      input.Email,
		Category:   input.Category,
		Status:     "registered",
	}
	repository.DB.Create(&reg)
	repository.DB.Preload("Marathon").First(&reg, reg.ID)

	c.JSON(http.StatusCreated, gin.H{"data": reg, "message": "참가 신청이 완료되었습니다"})
}

func CancelRegistration(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "로그인이 필요합니다"})
		return
	}

	var reg models.Registration
	if err := repository.DB.Where("id = ? AND user_id = ?", c.Param("id"), user.ID).First(&reg).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "신청 내역을 찾을 수 없습니다"})
		return
	}
	repository.DB.Model(&reg).Update("status", "cancelled")
	c.JSON(http.StatusOK, gin.H{"message": "참가 신청이 취소되었습니다"})
}
