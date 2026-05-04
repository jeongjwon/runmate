package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Name       string `json:"name" gorm:"not null"`
	Email      string `json:"email"`
	Picture    string `json:"picture"`
	Provider   string `json:"provider" gorm:"uniqueIndex:provider_uid;not null"`
	ProviderID string `json:"provider_id" gorm:"uniqueIndex:provider_uid;not null"`
}
