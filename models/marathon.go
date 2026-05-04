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

	Name            string         `json:"name" gorm:"not null"`
	Date            string         `json:"date" gorm:"not null"`
	Location        string         `json:"location"`
	City            string         `json:"city"`
	Categories      string         `json:"categories"`
	Description     string         `json:"description"`
	OfficialURL     string         `json:"official_url"`
	EntryFee        int            `json:"entry_fee"`
	MaxParticipants int            `json:"max_participants"`
	ImageURL        string         `json:"image_url"`
	IsActive        bool           `json:"is_active" gorm:"default:true"`
	Registrations   []Registration `json:"registrations,omitempty" gorm:"foreignKey:MarathonID"`
}

type Registration struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID     *uint    `json:"user_id" gorm:"index"`
	MarathonID uint     `json:"marathon_id" gorm:"not null"`
	Marathon   Marathon `json:"marathon,omitempty" gorm:"foreignKey:MarathonID"`
	RunnerName string   `json:"runner_name" gorm:"not null"`
	Email      string   `json:"email"`
	Category   string   `json:"category"`
	BibNumber  string   `json:"bib_number"`
	Status     string   `json:"status" gorm:"default:'registered'"`
}
