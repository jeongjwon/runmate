package services

import (
	"fmt"
	"runmate/models"
	"runmate/repository"
	"time"
)

// calcPace: 총 초 기준으로 km당 페이스 계산
func calcPace(distanceKm float64, durationSec int) string {
	if distanceKm == 0 || durationSec == 0 {
		return "-"
	}
	secondsPerKm := float64(durationSec) / distanceKm
	mins := int(secondsPerKm) / 60
	secs := int(secondsPerKm) % 60
	return fmt.Sprintf("%d'%02d\"", mins, secs)
}

func GetWeeklyStats(year, week int) []models.WeeklyStats {
	var stats []models.WeeklyStats

	now := time.Now()
	for i := 7; i >= 0; i-- {
		weekStart := now.AddDate(0, 0, -int(now.Weekday())-i*7)
		weekEnd := weekStart.AddDate(0, 0, 6)

		startStr := weekStart.Format("2006-01-02")
		endStr := weekEnd.Format("2006-01-02")

		var records []models.RunningRecord
		repository.DB.Where("date BETWEEN ? AND ?", startStr, endStr).Find(&records)

		var totalDist float64
		var totalDur int
		for _, r := range records {
			totalDist += r.Distance
			totalDur += r.Duration
		}

		stats = append(stats, models.WeeklyStats{
			Week:                   fmt.Sprintf("%s~%s", startStr[5:], endStr[5:]),
			TotalDistance:          totalDist,
			TotalDuration:          totalDur,
			TotalDurationFormatted: models.FormatDuration(totalDur),
			RunCount:               len(records),
			AvgPace:                calcPace(totalDist, totalDur),
		})
	}
	return stats
}

func GetMonthlyStats(year int) []models.MonthlyStats {
	var stats []models.MonthlyStats

	for month := 1; month <= 12; month++ {
		startStr := fmt.Sprintf("%d-%02d-01", year, month)
		nextMonth := time.Date(year, time.Month(month+1), 1, 0, 0, 0, 0, time.Local)
		endStr := nextMonth.AddDate(0, 0, -1).Format("2006-01-02")

		var records []models.RunningRecord
		repository.DB.Where("date BETWEEN ? AND ?", startStr, endStr).Find(&records)

		var totalDist float64
		var totalDur int
		var bestDist float64
		for _, r := range records {
			totalDist += r.Distance
			totalDur += r.Duration
			if r.Distance > bestDist {
				bestDist = r.Distance
			}
		}

		stats = append(stats, models.MonthlyStats{
			Month:                  fmt.Sprintf("%d월", month),
			TotalDistance:          totalDist,
			TotalDuration:          totalDur,
			TotalDurationFormatted: models.FormatDuration(totalDur),
			RunCount:               len(records),
			AvgPace:                calcPace(totalDist, totalDur),
			BestDistance:           bestDist,
		})
	}
	return stats
}

func GetYearlyStats() []models.YearlyStats {
	var stats []models.YearlyStats

	currentYear := time.Now().Year()
	for year := currentYear - 2; year <= currentYear; year++ {
		startStr := fmt.Sprintf("%d-01-01", year)
		endStr := fmt.Sprintf("%d-12-31", year)

		var records []models.RunningRecord
		repository.DB.Where("date BETWEEN ? AND ?", startStr, endStr).Find(&records)

		var totalDist float64
		var totalDur int
		for _, r := range records {
			totalDist += r.Distance
			totalDur += r.Duration
		}

		monthlyBreakdown := GetMonthlyStats(year)

		stats = append(stats, models.YearlyStats{
			Year:                   fmt.Sprintf("%d년", year),
			TotalDistance:          totalDist,
			TotalDuration:          totalDur,
			TotalDurationFormatted: models.FormatDuration(totalDur),
			RunCount:               len(records),
			AvgPace:                calcPace(totalDist, totalDur),
			MonthlyBreakdown:       monthlyBreakdown,
		})
	}
	return stats
}
