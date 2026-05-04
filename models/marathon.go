package models

import (
	"time"

	"gorm.io/gorm"
)

type Marathon struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Name            string `json:"name" gorm:"not null"`
	Date            string `json:"date" gorm:"not null"`
	Location        string `json:"location"`
	City            string `json:"city"`
	Categories      string `json:"categories"`
	Description     string `json:"description"`
	OfficialURL     string `json:"official_url"`
	EntryFee        int    `json:"entry_fee"`
	MaxParticipants int    `json:"max_participants"`
	ImageURL        string `json:"image_url"`
	IsActive        bool   `json:"is_active" gorm:"default:true"`
}
