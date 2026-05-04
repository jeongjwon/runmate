package handlers

import (
	"net/http"
	"runmate/models"
	"runmate/repository"
	"strconv"

	"github.com/gin-gonic/gin"
)

func GetWishes(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusOK, gin.H{"data": []interface{}{}})
		return
	}
	var wishes []models.MarathonWish
	repository.DB.Preload("Marathon").Where("user_id = ?", user.ID).Order("created_at DESC").Find(&wishes)
	c.JSON(http.StatusOK, gin.H{"data": wishes})
}

func ToggleWish(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "로그인이 필요합니다"})
		return
	}

	marathonID, err := strconv.ParseUint(c.Param("marathon_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "잘못된 마라톤 ID"})
		return
	}

	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var wish models.MarathonWish
	result := repository.DB.Where("user_id = ? AND marathon_id = ?", user.ID, uint(marathonID)).First(&wish)

	if result.Error == nil {
		// 이미 존재 → 삭제 (토글 off)
		repository.DB.Delete(&wish)
		c.JSON(http.StatusOK, gin.H{"action": "removed", "marathon_id": marathonID})
		return
	}

	wish = models.MarathonWish{
		UserID:     user.ID,
		MarathonID: uint(marathonID),
		Status:     "wished",
	}
	repository.DB.Create(&wish)
	c.JSON(http.StatusCreated, gin.H{"action": "created", "data": wish})
}

// UpdateWishRecord 출전 종목과 완주 기록 저장
func UpdateWishRecord(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "로그인이 필요합니다"})
		return
	}

	marathonID, err := strconv.ParseUint(c.Param("marathon_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "잘못된 마라톤 ID"})
		return
	}

	var input struct {
		Category   string `json:"category"`
		FinishTime string `json:"finish_time"` // "H:MM:SS"
		RaceNotes  string `json:"race_notes"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var wish models.MarathonWish
	if err := repository.DB.Where("user_id = ? AND marathon_id = ?", user.ID, uint(marathonID)).First(&wish).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "참여 마라톤을 찾을 수 없습니다"})
		return
	}

	updates := map[string]interface{}{
		"category":   input.Category,
		"race_notes": input.RaceNotes,
	}
	if input.FinishTime != "" {
		sec, err := models.ParseDuration(input.FinishTime)
		if err == nil && sec > 0 {
			updates["finish_time"] = sec
		}
	}

	repository.DB.Model(&wish).Updates(updates)
	repository.DB.Preload("Marathon").First(&wish, wish.ID)
	c.JSON(http.StatusOK, gin.H{"data": wish, "message": "기록이 저장되었습니다"})
}
