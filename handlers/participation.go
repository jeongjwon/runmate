package handlers

import (
	"net/http"
	"runmate/models"
	"runmate/repository"
	"strconv"

	"github.com/gin-gonic/gin"
)

func GetParticipations(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusOK, gin.H{"data": []interface{}{}})
		return
	}
	var participations []models.MarathonParticipation
	repository.DB.Preload("Marathon").Where("user_id = ?", user.ID).Order("created_at DESC").Find(&participations)
	c.JSON(http.StatusOK, gin.H{"data": participations})
}

func AddParticipation(c *gin.Context) {
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

	// 이미 존재하면 그대로 반환 (중복 추가 방지)
	var p models.MarathonParticipation
	if err := repository.DB.Where("user_id = ? AND marathon_id = ?", user.ID, uint(marathonID)).First(&p).Error; err == nil {
		c.JSON(http.StatusCreated, gin.H{"data": p})
		return
	}

	p = models.MarathonParticipation{UserID: user.ID, MarathonID: uint(marathonID)}
	if err := repository.DB.Create(&p).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": p})
}

func RemoveParticipation(c *gin.Context) {
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

	var p models.MarathonParticipation
	if err := repository.DB.Where("user_id = ? AND marathon_id = ?", user.ID, uint(marathonID)).First(&p).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "참가 내역을 찾을 수 없습니다"})
		return
	}
	// 하드 딜리트: 기록(category, finish_time 등)까지 완전 삭제
	repository.DB.Unscoped().Delete(&p)
	c.JSON(http.StatusOK, gin.H{"marathon_id": marathonID})
}

func UpdateParticipationRecord(c *gin.Context) {
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

	var p models.MarathonParticipation
	if err := repository.DB.Where("user_id = ? AND marathon_id = ?", user.ID, uint(marathonID)).First(&p).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "참가 마라톤을 찾을 수 없습니다"})
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

	repository.DB.Model(&p).Updates(updates)
	repository.DB.Preload("Marathon").First(&p, p.ID)
	c.JSON(http.StatusOK, gin.H{"data": p, "message": "기록이 저장되었습니다"})
}
