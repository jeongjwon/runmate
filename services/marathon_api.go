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
			City:        ExtractCity(item.개최장소),
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

// ExtractCity maps a Korean address string to a 시도-level administrative name.
func ExtractCity(location string) string {
	rules := []struct{ keyword, city string }{
		// 특별시·광역시 (구체적인 것 먼저)
		{"서울", "서울특별시"},
		{"부산", "부산광역시"},
		{"대구", "대구광역시"},
		{"인천", "인천광역시"},
		{"광주광역", "광주광역시"},
		{"대전", "대전광역시"},
		{"울산", "울산광역시"},
		{"세종", "세종특별자치도"},
		{"제주", "제주특별자치도"},
		// 도 약칭·전칭
		{"경기", "경기도"},
		{"강원", "강원특별자치도"},
		{"충청북도", "충청북도"}, {"충북", "충청북도"},
		{"충청남도", "충청남도"}, {"충남", "충청남도"},
		{"전라북도", "전라북도"}, {"전북", "전라북도"},
		{"전라남도", "전라남도"}, {"전남", "전라남도"},
		{"경상북도", "경상북도"}, {"경북", "경상북도"},
		{"경상남도", "경상남도"}, {"경남", "경상남도"},
		// 경기도 시·군
		{"수원", "경기도"}, {"고양", "경기도"}, {"용인", "경기도"}, {"성남", "경기도"},
		{"부천", "경기도"}, {"안산", "경기도"}, {"안양", "경기도"}, {"남양주", "경기도"},
		{"화성", "경기도"}, {"평택", "경기도"}, {"의정부", "경기도"}, {"시흥", "경기도"},
		{"파주", "경기도"}, {"광명", "경기도"}, {"김포", "경기도"}, {"군포", "경기도"},
		{"이천", "경기도"}, {"양주", "경기도"}, {"구리", "경기도"}, {"오산", "경기도"},
		{"하남", "경기도"}, {"의왕", "경기도"}, {"포천", "경기도"}, {"여주", "경기도"},
		{"동두천", "경기도"}, {"과천", "경기도"}, {"가평", "경기도"}, {"양평", "경기도"},
		{"연천", "경기도"},
		// 강원특별자치도 시·군
		{"춘천", "강원특별자치도"}, {"원주", "강원특별자치도"}, {"강릉", "강원특별자치도"},
		{"동해", "강원특별자치도"}, {"태백", "강원특별자치도"}, {"속초", "강원특별자치도"},
		{"삼척", "강원특별자치도"}, {"홍천", "강원특별자치도"}, {"횡성", "강원특별자치도"},
		{"영월", "강원특별자치도"}, {"평창", "강원특별자치도"}, {"정선", "강원특별자치도"},
		{"철원", "강원특별자치도"}, {"화천", "강원특별자치도"}, {"양구", "강원특별자치도"},
		{"인제", "강원특별자치도"}, {"양양", "강원특별자치도"},
		// 충청북도 시·군
		{"청주", "충청북도"}, {"충주", "충청북도"}, {"제천", "충청북도"},
		{"보은", "충청북도"}, {"옥천", "충청북도"}, {"영동", "충청북도"},
		{"증평", "충청북도"}, {"진천", "충청북도"}, {"괴산", "충청북도"},
		{"음성", "충청북도"}, {"단양", "충청북도"},
		// 충청남도 시·군
		{"천안", "충청남도"}, {"공주", "충청남도"}, {"보령", "충청남도"},
		{"아산", "충청남도"}, {"서산", "충청남도"}, {"논산", "충청남도"},
		{"계룡", "충청남도"}, {"당진", "충청남도"}, {"금산", "충청남도"},
		{"부여", "충청남도"}, {"서천", "충청남도"}, {"청양", "충청남도"},
		{"홍성", "충청남도"}, {"예산", "충청남도"}, {"태안", "충청남도"},
		// 전라북도 시·군
		{"전주", "전라북도"}, {"군산", "전라북도"}, {"익산", "전라북도"},
		{"정읍", "전라북도"}, {"남원", "전라북도"}, {"김제", "전라북도"},
		{"완주", "전라북도"}, {"진안", "전라북도"}, {"무주", "전라북도"},
		{"장수", "전라북도"}, {"임실", "전라북도"}, {"순창", "전라북도"},
		{"고창", "전라북도"}, {"부안", "전라북도"},
		// 전라남도 시·군
		{"목포", "전라남도"}, {"여수", "전라남도"}, {"순천", "전라남도"},
		{"나주", "전라남도"}, {"광양", "전라남도"}, {"담양", "전라남도"},
		{"곡성", "전라남도"}, {"구례", "전라남도"}, {"고흥", "전라남도"},
		{"보성", "전라남도"}, {"화순", "전라남도"}, {"장흥", "전라남도"},
		{"강진", "전라남도"}, {"해남", "전라남도"}, {"영암", "전라남도"},
		{"무안", "전라남도"}, {"함평", "전라남도"}, {"영광", "전라남도"},
		{"장성", "전라남도"}, {"완도", "전라남도"}, {"진도", "전라남도"}, {"신안", "전라남도"},
		// 경상북도 시·군
		{"포항", "경상북도"}, {"경주", "경상북도"}, {"김천", "경상북도"},
		{"안동", "경상북도"}, {"구미", "경상북도"}, {"영주", "경상북도"},
		{"영천", "경상북도"}, {"상주", "경상북도"}, {"문경", "경상북도"},
		{"경산", "경상북도"}, {"의성", "경상북도"}, {"청송", "경상북도"},
		{"영양", "경상북도"}, {"영덕", "경상북도"}, {"청도", "경상북도"},
		{"고령", "경상북도"}, {"성주", "경상북도"}, {"칠곡", "경상북도"},
		{"예천", "경상북도"}, {"봉화", "경상북도"}, {"울진", "경상북도"}, {"울릉", "경상북도"},
		// 경상남도 시·군
		{"창원", "경상남도"}, {"진주", "경상남도"}, {"통영", "경상남도"},
		{"사천", "경상남도"}, {"김해", "경상남도"}, {"밀양", "경상남도"},
		{"거제", "경상남도"}, {"양산", "경상남도"}, {"의령", "경상남도"},
		{"함안", "경상남도"}, {"창녕", "경상남도"}, {"남해", "경상남도"},
		{"하동", "경상남도"}, {"산청", "경상남도"}, {"함양", "경상남도"},
		{"거창", "경상남도"}, {"합천", "경상남도"},
		// 제주특별자치도
		{"서귀포", "제주특별자치도"},
		// 광주 — 광주광역시는 위에서 처리됨, 나머지는 경기도 광주시
		{"광주", "경기도"},
	}
	for _, r := range rules {
		if strings.Contains(location, r.keyword) {
			return r.city
		}
	}
	return ""
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
