package models

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

type RunningRecord struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Date              string  `json:"date" gorm:"not null"`
	Distance          float64 `json:"distance" gorm:"not null"`
	Duration          int     `json:"duration" gorm:"not null"` // 총 초(seconds)
	DurationFormatted string  `json:"duration_formatted" gorm:"-"`
	Pace              string  `json:"pace"`
	HeartRate         int     `json:"heart_rate"`
	Calories          int     `json:"calories"`
	RouteType         string  `json:"route_type"`
	Weather           string  `json:"weather"`
	Notes             string  `json:"notes"`
	MarathonID        *uint   `json:"marathon_id"`
}

func (r *RunningRecord) AfterFind(tx *gorm.DB) error {
	r.DurationFormatted = FormatDuration(r.Duration)
	return nil
}

func FormatDuration(seconds int) string {
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%d:%02d", m, s)
}

func ParseDuration(s string) (int, error) {
	var h, m, sec int
	if n, _ := fmt.Sscanf(s, "%d:%d:%d", &h, &m, &sec); n == 3 {
		return h*3600 + m*60 + sec, nil
	}
	if n, _ := fmt.Sscanf(s, "%d:%d", &m, &sec); n == 2 {
		return m*60 + sec, nil
	}
	return 0, fmt.Errorf("올바른 형식이 아닙니다 (HH:MM:SS 또는 MM:SS)")
}

type WeeklyStats struct {
	Week                   string  `json:"week"`
	TotalDistance          float64 `json:"total_distance"`
	TotalDuration          int     `json:"total_duration"`
	TotalDurationFormatted string  `json:"total_duration_formatted"`
	RunCount               int     `json:"run_count"`
	AvgPace                string  `json:"avg_pace"`
}

type MonthlyStats struct {
	Month                  string  `json:"month"`
	TotalDistance          float64 `json:"total_distance"`
	TotalDuration          int     `json:"total_duration"`
	TotalDurationFormatted string  `json:"total_duration_formatted"`
	RunCount               int     `json:"run_count"`
	AvgPace                string  `json:"avg_pace"`
	BestDistance           float64 `json:"best_distance"`
}

type YearlyStats struct {
	Year                   string         `json:"year"`
	TotalDistance          float64        `json:"total_distance"`
	TotalDuration          int            `json:"total_duration"`
	TotalDurationFormatted string         `json:"total_duration_formatted"`
	RunCount               int            `json:"run_count"`
	AvgPace                string         `json:"avg_pace"`
	MonthlyBreakdown       []MonthlyStats `json:"monthly_breakdown"`
}
