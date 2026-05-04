package models

import (
	"time"

	"gorm.io/gorm"
)

type MarathonParticipation struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID     uint     `json:"user_id" gorm:"uniqueIndex:uidx_user_marathon;not null"`
	MarathonID uint     `json:"marathon_id" gorm:"uniqueIndex:uidx_user_marathon;not null"`
	Marathon   Marathon `json:"marathon,omitempty" gorm:"foreignKey:MarathonID"`

	// 출전 기록 (선택)
	Category            string `json:"category"`              // 출전 종목
	FinishTime          int    `json:"finish_time"`           // 완주 시간(초), 0이면 미입력
	FinishTimeFormatted string `json:"finish_time_formatted" gorm:"-"`
	RaceNotes           string `json:"race_notes"`            // 메모
}

func (p *MarathonParticipation) AfterFind(tx *gorm.DB) error {
	if p.FinishTime > 0 {
		p.FinishTimeFormatted = FormatDuration(p.FinishTime)
	}
	return nil
}
