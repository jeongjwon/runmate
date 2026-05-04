package handlers

import (
	"fmt"
	"net/http"
	"runmate/models"
	"runmate/repository"
	"runmate/services"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func GetRecords(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusOK, gin.H{"data": []models.RunningRecord{}})
		return
	}

	var records []models.RunningRecord
	query := repository.DB.Where("user_id = ?", user.ID).Order("date DESC")

	if from := c.Query("from"); from != "" {
		query = query.Where("date >= ?", from)
	}
	if to := c.Query("to"); to != "" {
		query = query.Where("date <= ?", to)
	}

	query.Find(&records)
	c.JSON(http.StatusOK, gin.H{"data": records})
}

func GetRecord(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "로그인이 필요합니다"})
		return
	}
	var record models.RunningRecord
	if err := repository.DB.Where("id = ? AND user_id = ?", c.Param("id"), user.ID).First(&record).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "기록을 찾을 수 없습니다"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": record})
}

func calcPace(distKm float64, durationSec int) string {
	if distKm == 0 || durationSec == 0 {
		return "-"
	}
	secsPerKm := float64(durationSec) / distKm
	mins := int(secsPerKm) / 60
	secs := int(secsPerKm) % 60
	return fmt.Sprintf("%d'%02d\"", mins, secs)
}

func CreateRecord(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "로그인이 필요합니다"})
		return
	}

	var input struct {
		Date      string  `json:"date" binding:"required"`
		Distance  float64 `json:"distance" binding:"required,gt=0"`
		Duration  string  `json:"duration" binding:"required"`
		HeartRate int     `json:"heart_rate"`
		Calories  int     `json:"calories"`
		RouteType string  `json:"route_type"`
		Weather   string  `json:"weather"`
		Notes     string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	durationSec, err := models.ParseDuration(input.Duration)
	if err != nil || durationSec <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "시간 형식이 올바르지 않습니다 (HH:MM:SS 또는 MM:SS)"})
		return
	}

	record := models.RunningRecord{
		UserID:    &user.ID,
		Date:      input.Date,
		Distance:  input.Distance,
		Duration:  durationSec,
		Pace:      calcPace(input.Distance, durationSec),
		HeartRate: input.HeartRate,
		Calories:  input.Calories,
		RouteType: input.RouteType,
		Weather:   input.Weather,
		Notes:     input.Notes,
	}
	repository.DB.Create(&record)
	record.DurationFormatted = models.FormatDuration(record.Duration)
	c.JSON(http.StatusCreated, gin.H{"data": record, "message": "기록이 저장되었습니다"})
}

func UpdateRecord(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "로그인이 필요합니다"})
		return
	}

	var record models.RunningRecord
	if err := repository.DB.Where("id = ? AND user_id = ?", c.Param("id"), user.ID).First(&record).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "기록을 찾을 수 없습니다"})
		return
	}

	var input struct {
		Date      string  `json:"date"`
		Distance  float64 `json:"distance"`
		Duration  string  `json:"duration"`
		HeartRate int     `json:"heart_rate"`
		Calories  int     `json:"calories"`
		RouteType string  `json:"route_type"`
		Weather   string  `json:"weather"`
		Notes     string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{"notes": input.Notes}

	if input.Date != "" {
		updates["date"] = input.Date
	}
	if input.Distance > 0 {
		updates["distance"] = input.Distance
	}
	if input.Duration != "" {
		sec, err := models.ParseDuration(input.Duration)
		if err != nil || sec <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "시간 형식이 올바르지 않습니다 (HH:MM:SS 또는 MM:SS)"})
			return
		}
		updates["duration"] = sec
	}
	if input.HeartRate > 0 {
		updates["heart_rate"] = input.HeartRate
	}
	if input.Calories > 0 {
		updates["calories"] = input.Calories
	}
	if input.RouteType != "" {
		updates["route_type"] = input.RouteType
	}
	if input.Weather != "" {
		updates["weather"] = input.Weather
	}

	dist := record.Distance
	dur := record.Duration
	if d, ok := updates["distance"].(float64); ok {
		dist = d
	}
	if d, ok := updates["duration"].(int); ok {
		dur = d
	}
	updates["pace"] = calcPace(dist, dur)

	repository.DB.Model(&record).Updates(updates)
	repository.DB.First(&record, record.ID)
	record.DurationFormatted = models.FormatDuration(record.Duration)

	c.JSON(http.StatusOK, gin.H{"data": record, "message": "기록이 수정되었습니다"})
}

func DeleteRecord(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "로그인이 필요합니다"})
		return
	}

	var record models.RunningRecord
	if err := repository.DB.Where("id = ? AND user_id = ?", c.Param("id"), user.ID).First(&record).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "기록을 찾을 수 없습니다"})
		return
	}
	repository.DB.Delete(&record)
	c.JSON(http.StatusOK, gin.H{"message": "기록이 삭제되었습니다"})
}

func GetStats(c *gin.Context) {
	user := GetCurrentUser(c)
	var userID uint
	if user != nil {
		userID = user.ID
	}

	period := c.Query("period")
	yearStr := c.Query("year")

	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}

	switch period {
	case "weekly":
		stats := services.GetWeeklyStats(userID)
		c.JSON(http.StatusOK, gin.H{"data": stats, "period": "weekly"})
	case "monthly":
		stats := services.GetMonthlyStats(userID, year)
		c.JSON(http.StatusOK, gin.H{"data": stats, "period": "monthly", "year": year})
	case "yearly":
		stats := services.GetYearlyStats(userID)
		c.JSON(http.StatusOK, gin.H{"data": stats, "period": "yearly"})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "period 파라미터가 필요합니다 (weekly/monthly/yearly)"})
	}
}
