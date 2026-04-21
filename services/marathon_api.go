package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runmate/models"
	"runmate/repository"
	"strings"
)

// 공공데이터포털 문화체육관광부 국내마라톤대회 정보
// 데이터셋: https://www.data.go.kr/data/15138980/fileData.do
// API 키 발급: data.go.kr 회원가입 후 해당 데이터셋 활용신청
const publicDataAPIURL = "https://api.odcloud.kr/api/15138980/v1/uddi:e34c6a00-2a39-4a57-b7db-84b4a7f0b2b6"

type publicDataResponse struct {
	CurrentCount int              `json:"currentCount"`
	Data         []publicMarathon `json:"data"`
	MatchCount   int              `json:"matchCount"`
	Page         int              `json:"page"`
	PerPage      int              `json:"perPage"`
	TotalCount   int              `json:"totalCount"`
}

type publicMarathon struct {
	대회명   string `json:"대회명"`
	개최일자  string `json:"개최일자"`
	개최장소  string `json:"개최장소"`
	주최기관  string `json:"주최기관"`
	종목     string `json:"종목"`
	참가비   string `json:"참가비"`
	홈페이지  string `json:"홈페이지"`
}

type SyncResult struct {
	Added   int    `json:"added"`
	Updated int    `json:"updated"`
	Message string `json:"message"`
}

func SyncMarathonsFromAPI() (*SyncResult, error) {
	apiKey := os.Getenv("MARATHON_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("MARATHON_API_KEY 환경변수가 설정되지 않았습니다.\n" +
			"data.go.kr에서 '국내마라톤대회 정보' 데이터셋 활용신청 후 발급받은 서비스키를 설정해주세요.\n" +
			"예: export MARATHON_API_KEY=your_service_key_here")
	}

	url := fmt.Sprintf("%s?serviceKey=%s&page=1&perPage=100", publicDataAPIURL, apiKey)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("API 호출 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API 응답 오류: HTTP %d", resp.StatusCode)
	}

	var apiResp publicDataResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("응답 파싱 실패: %w", err)
	}

	result := &SyncResult{}
	for _, item := range apiResp.Data {
		marathon := models.Marathon{
			Name:        item.대회명,
			Date:        normalizeDate(item.개최일자),
			Location:    item.개최장소,
			City:        extractCity(item.개최장소),
			Categories:  normalizeCategories(item.종목),
			OfficialURL: item.홈페이지,
			EntryFee:    parseEntryFee(item.참가비),
			IsActive:    true,
		}

		var existing models.Marathon
		if err := repository.DB.Where("name = ?", marathon.Name).First(&existing).Error; err != nil {
			// 신규 등록
			repository.DB.Create(&marathon)
			result.Added++
		} else {
			// 날짜/장소 업데이트
			repository.DB.Model(&existing).Updates(map[string]interface{}{
				"date":     marathon.Date,
				"location": marathon.Location,
			})
			result.Updated++
		}
	}

	result.Message = fmt.Sprintf("동기화 완료: 신규 %d개, 업데이트 %d개", result.Added, result.Updated)
	return result, nil
}

func normalizeDate(s string) string {
	// "20260315" → "2026-03-15"
	s = strings.ReplaceAll(s, ".", "-")
	if len(s) == 8 && !strings.Contains(s, "-") {
		return s[:4] + "-" + s[4:6] + "-" + s[6:]
	}
	return s
}

func extractCity(location string) string {
	cities := []string{"서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
		"경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
		"춘천", "경주", "전주", "수원", "창원", "진주"}
	for _, city := range cities {
		if strings.Contains(location, city) {
			return city
		}
	}
	return location
}

func normalizeCategories(s string) string {
	cats := []string{}
	if strings.Contains(s, "5") {
		cats = append(cats, "5K")
	}
	if strings.Contains(s, "10") {
		cats = append(cats, "10K")
	}
	if strings.Contains(s, "하프") || strings.Contains(s, "21") {
		cats = append(cats, "Half")
	}
	if strings.Contains(s, "풀") || strings.Contains(s, "42") || strings.Contains(s, "마라톤") {
		cats = append(cats, "Full")
	}
	if len(cats) == 0 {
		return "Full"
	}
	return strings.Join(cats, ",")
}

func parseEntryFee(s string) int {
	s = strings.ReplaceAll(s, ",", "")
	s = strings.ReplaceAll(s, "원", "")
	s = strings.TrimSpace(s)
	var fee int
	fmt.Sscanf(s, "%d", &fee)
	return fee
}
