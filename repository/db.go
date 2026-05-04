package repository

import (
	"log"
	"os"
	"runmate/models"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func ConnectDB() {
	var err error
	cfg := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	}

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		log.Println("PostgreSQL(Supabase)에 연결합니다")
		DB, err = gorm.Open(postgres.New(postgres.Config{
			DSN:                  dsn,
			PreferSimpleProtocol: true,
		}), cfg)
	} else {
		log.Println("SQLite(로컬)에 연결합니다")
		DB, err = gorm.Open(sqlite.Open("runmate.db"), cfg)
	}
	if err != nil {
		log.Fatal("DB 연결 실패:", err)
	}
}

func AutoMigrateDB() {
	err := DB.AutoMigrate(
		&models.User{},
		&models.Marathon{},
		&models.RunningRecord{},
		&models.MarathonParticipation{},
	)
	if err != nil {
		log.Fatal("DB AutoMigrate 실패:", err)
	}
}

func InitDB() {
	ConnectDB()
	AutoMigrateDB()
}
