package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runmate/models"
	"strings"
)

const claudeAPIURL = "https://api.anthropic.com/v1/messages"
const claudeModel = "claude-haiku-4-5-20251001"

type claudeRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	System    string          `json:"system"`
	Messages  []claudeMessage `json:"messages"`
}

type claudeMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type claudeResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
}

type parsedMarathon struct {
	Name        string `json:"name"`
	Date        string `json:"date"`
	Location    string `json:"location"`
	City        string `json:"city"`
	Categories  string `json:"categories"`
	OfficialURL string `json:"official_url"`
	EntryFee    int    `json:"entry_fee"`
	Description string `json:"description"`
}

var parseSystemPrompt = `당신은 웹 페이지에서 한국 마라톤 대회 정보를 추출하는 전문가입니다.
주어진 텍스트에서 마라톤·달리기 대회 정보를 추출하여 JSON 배열만 반환하세요.
설명이나 마크다운 없이 순수한 JSON 배열만 출력합니다.

출력 형식:
[
  {
    "name": "대회 전체 이름",
    "date": "YYYY-MM-DD",
    "location": "개최 장소",
    "city": "도시명 (서울/부산/대구/인천/광주/대전/울산/제주/경기/강원/충북/충남/전북/전남/경북/경남/춘천/경주/전주/수원/창원 중 가장 적합한 것)",
    "categories": "종목 (5K,10K,Half,Full 조합, 쉼표 구분)",
    "official_url": "공식 URL (없으면 빈 문자열)",
    "entry_fee": 참가비 숫자 (없으면 0),
    "description": "대회 한 줄 소개"
  }
]

규칙:
- 날짜가 없거나 불명확한 항목은 제외
- 풀코스/42.195km → "Full", 하프/21km → "Half", 10km → "10K", 5km → "5K"
- entry_fee는 숫자만 (쉼표·원 제거, 예: 30000)
- 마라톤/달리기 대회만 포함 (사이클, 수영 등 제외)
- 중복 제거`

func ParseMarathonsWithClaude(pageContent string) ([]models.Marathon, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다")
	}

	reqBody := claudeRequest{
		Model:     claudeModel,
		MaxTokens: 4096,
		System:    parseSystemPrompt,
		Messages: []claudeMessage{
			{
				Role:    "user",
				Content: "다음 페이지 내용에서 마라톤 대회 정보를 추출하세요:\n\n" + pageContent,
			},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("요청 직렬화 실패: %w", err)
	}

	req, err := http.NewRequest("POST", claudeAPIURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("요청 생성 실패: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("Claude API 호출 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Claude API 오류: HTTP %d", resp.StatusCode)
	}

	var claudeResp claudeResponse
	if err := json.NewDecoder(resp.Body).Decode(&claudeResp); err != nil {
		return nil, fmt.Errorf("응답 파싱 실패: %w", err)
	}
	if len(claudeResp.Content) == 0 {
		return nil, fmt.Errorf("빈 응답")
	}

	text := claudeResp.Content[0].Text
	start := strings.Index(text, "[")
	end := strings.LastIndex(text, "]")
	if start == -1 || end == -1 || end < start {
		return nil, fmt.Errorf("JSON 배열 없음: %.200s", text)
	}

	var parsed []parsedMarathon
	if err := json.Unmarshal([]byte(text[start:end+1]), &parsed); err != nil {
		return nil, fmt.Errorf("JSON 파싱 실패: %w", err)
	}

	out := make([]models.Marathon, 0, len(parsed))
	for _, p := range parsed {
		if p.Name == "" || p.Date == "" {
			continue
		}
		out = append(out, models.Marathon{
			Name:        p.Name,
			Date:        p.Date,
			Location:    p.Location,
			City:        p.City,
			Categories:  p.Categories,
			OfficialURL: p.OfficialURL,
			EntryFee:    p.EntryFee,
			Description: p.Description,
			IsActive:    true,
		})
	}
	return out, nil
}
