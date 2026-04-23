package services

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"runmate/models"
	"runmate/repository"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/net/html"
	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/transform"
)

type crawlTarget struct {
	Name    string
	URL     string
	Charset string
	Method  string
	Params  map[string]string
	// parser: "roadrun" = 직접 파싱, "claude" = AI 파싱
	Parser string
}

// roadrun.co.kr: marathon.pe.kr/schedule_index.html 프레임 내 실제 일정 DB (316개 대회)
var crawlTargets = []crawlTarget{
	{
		Name:    "도로런",
		URL:     "http://www.roadrun.co.kr/schedule/list.php",
		Charset: "euc-kr",
		Method:  "POST",
		Params:  map[string]string{"syear_key": "2026"},
		Parser:  "roadrun",
	},
}

func CrawlAndSyncMarathons() (*SyncResult, error) {
	var allMarathons []models.Marathon
	
	var crawlErrors []string

	for _, target := range crawlTargets {
		content, err := fetchPage(target.URL, target.Charset, target.Method, target.Params)
		if err != nil {
			crawlErrors = append(crawlErrors, fmt.Sprintf("%s: %v", target.Name, err))
			continue
		}

		text := extractMainText(content)
		if len([]rune(text)) < 50 {
			crawlErrors = append(crawlErrors, fmt.Sprintf("%s: 본문 내용 없음", target.Name))
			continue
		}

		var marathons []models.Marathon
		if target.Parser == "roadrun" {
			marathons = parseRoadRunSchedule(text)
		} else {
			// Claude를 사용하는 사이트는 8000자 제한 후 AI 파싱
			runes := []rune(text)
			if len(runes) > 8000 {
				text = string(runes[:8000])
			}
			marathons, err = ParseMarathonsWithClaude(text)
			if err != nil {
				crawlErrors = append(crawlErrors, fmt.Sprintf("%s: %v", target.Name, err))
				continue
			}
		}

		allMarathons = append(allMarathons, marathons...)
	}

	if len(allMarathons) == 0 {
		msg := "크롤링된 마라톤 데이터가 없습니다"
		if len(crawlErrors) > 0 {
			msg += " — " + strings.Join(crawlErrors, "; ")
		}
		return nil, fmt.Errorf("%s", msg)
	}

	result := &SyncResult{}
	for _, marathon := range allMarathons {
		var existing models.Marathon
		if err := repository.DB.Where("name = ?", marathon.Name).First(&existing).Error; err != nil {
			repository.DB.Create(&marathon)
			result.Added++
		} else {
			repository.DB.Model(&existing).Updates(map[string]interface{}{
				"date":         marathon.Date,
				"location":     marathon.Location,
				"city":         marathon.City,
				"categories":   marathon.Categories,
				"official_url": marathon.OfficialURL,
				"entry_fee":    marathon.EntryFee,
				"description":  marathon.Description,
			})
			result.Updated++
		}
	}

	result.Message = fmt.Sprintf("크롤링 동기화 완료: 신규 %d개, 업데이트 %d개", result.Added, result.Updated)
	if len(crawlErrors) > 0 {
		result.Message += fmt.Sprintf(" (일부 실패: %s)", strings.Join(crawlErrors, "; "))
	}
	return result, nil
}

// roadrun.co.kr 텍스트 직접 파싱 (316개 전체 처리, Claude 불필요)
// 추출된 텍스트 패턴: 날짜(M/D) → (요일) → 대회명 → 종목 → 장소 → 주최 → ☎전화
var (
	reDateLine     = regexp.MustCompile(`^\d{1,2}/\d{1,2}$`)
	reWeekdayLine  = regexp.MustCompile(`^\([월화수목금토일]\)$`)
	reCategoryLine = regexp.MustCompile(`(?i)풀|하프|full|half|\d+km|\d+k,|\d+k$|km,|,km`)
)

func parseRoadRunSchedule(text string) []models.Marathon {
	lines := strings.Split(text, "\n")
	var marathons []models.Marathon

	// 헤더 이후 실제 리스트 시작 위치 찾기
	startIdx := -1
	for i, l := range lines {
		if strings.TrimSpace(l) == "날짜" {
			startIdx = i + 1
			break
		}
	}
	if startIdx < 0 {
		// 헤더 못 찾으면 처음부터
		startIdx = 0
	}

	i := startIdx
	for i < len(lines) {
		line := strings.TrimSpace(lines[i])

		if !reDateLine.MatchString(line) {
			i++
			continue
		}

		dateStr := line
		i++

		// 요일 건너뜀
		if i < len(lines) && reWeekdayLine.MatchString(strings.TrimSpace(lines[i])) {
			i++
		}

		// 대회명
		if i >= len(lines) {
			break
		}
		name := strings.TrimSpace(lines[i])
		i++

		// 종목 (선택적)
		categories := "Full"
		if i < len(lines) {
			next := strings.TrimSpace(lines[i])
			if reCategoryLine.MatchString(next) {
				categories = normalizeCategories(next)
				i++
			}
		}

		// 장소
		location := ""
		if i < len(lines) {
			location = strings.TrimSpace(lines[i])
			i++
		}

		// 주최/전화 등 다음 날짜까지 건너뜀
		for i < len(lines) && !reDateLine.MatchString(strings.TrimSpace(lines[i])) {
			i++
		}

		if name == "" {
			continue
		}

		fullDate, ok := parseRoadRunDate(dateStr)
		if !ok {
			continue
		}

		marathons = append(marathons, models.Marathon{
			Name:       name,
			Date:       fullDate,
			Location:   location,
			City:       extractCity(location),
			Categories: categories,
			IsActive:   true,
		})
	}

	return marathons
}

func parseRoadRunDate(s string) (string, bool) {
	parts := strings.Split(s, "/")
	if len(parts) != 2 {
		return "", false
	}
	m, err1 := strconv.Atoi(parts[0])
	d, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || m < 1 || m > 12 || d < 1 || d > 31 {
		return "", false
	}
	return fmt.Sprintf("2026-%02d-%02d", m, d), true
}

func fetchPage(rawURL, charset, method string, params map[string]string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}

	var req *http.Request
	var err error

	if method == "POST" {
		form := url.Values{}
		for k, v := range params {
			form.Set(k, v)
		}
		req, err = http.NewRequest("POST", rawURL, strings.NewReader(form.Encode()))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	} else {
		req, err = http.NewRequest("GET", rawURL, nil)
		if err != nil {
			return "", err
		}
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "ko-KR,ko;q=0.9")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("요청 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	var reader io.Reader = resp.Body
	if strings.ToLower(charset) == "euc-kr" {
		reader = transform.NewReader(resp.Body, korean.EUCKR.NewDecoder())
	}

	body, err := io.ReadAll(reader)
	if err != nil {
		return "", fmt.Errorf("읽기 실패: %w", err)
	}

	if !utf8.Valid(body) {
		return "", fmt.Errorf("유효하지 않은 인코딩 (euc-kr 변환 실패 가능)")
	}

	return string(body), nil
}

var skipTags = map[string]bool{
	"script": true, "style": true, "head": true,
	"nav": true, "footer": true, "iframe": true, "noscript": true,
}

func extractMainText(htmlContent string) string {
	doc, err := html.Parse(strings.NewReader(htmlContent))
	if err != nil {
		return htmlContent
	}

	var lines []string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && skipTags[n.Data] {
			return
		}
		if n.Type == html.TextNode {
			text := strings.TrimSpace(n.Data)
			if text != "" {
				lines = append(lines, text)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	return strings.Join(lines, "\n")
}
