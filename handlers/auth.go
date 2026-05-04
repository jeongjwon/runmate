package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/gob"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runmate/models"
	"runmate/repository"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/sessions"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

func init() {
	gob.Register(uint(0))
}

var Store *sessions.CookieStore

// TemplateData is passed to all HTML templates.
type TemplateData struct {
	User *models.User
}

func InitAuth() {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		secret = "runmate-default-secret-change-in-production"
	}
	Store = sessions.NewCookieStore([]byte(secret))
	Store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 30,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}
}

func baseURL() string {
	if u := os.Getenv("BASE_URL"); u != "" {
		return u
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	return "http://localhost:" + port
}

func googleConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		RedirectURL:  baseURL() + "/auth/google/callback",
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

func kakaoConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     os.Getenv("KAKAO_CLIENT_ID"),
		ClientSecret: os.Getenv("KAKAO_CLIENT_SECRET"),
		RedirectURL:  baseURL() + "/auth/kakao/callback",
		Scopes:       []string{"profile_nickname", "account_email"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://kauth.kakao.com/oauth/authorize",
			TokenURL: "https://kauth.kakao.com/oauth/token",
		},
	}
}

func naverConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     os.Getenv("NAVER_CLIENT_ID"),
		ClientSecret: os.Getenv("NAVER_CLIENT_SECRET"),
		RedirectURL:  baseURL() + "/auth/naver/callback",
		Scopes:       []string{},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://nid.naver.com/oauth2.0/authorize",
			TokenURL: "https://nid.naver.com/oauth2.0/token",
		},
	}
}

func randomState() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

// AuthMiddleware loads the user from the session into the Gin context.
// Does not block unauthenticated requests.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		session, err := Store.Get(c.Request, "runmate-session")
		if err != nil {
			c.Next()
			return
		}
		userID, ok := session.Values["user_id"].(uint)
		if !ok || userID == 0 {
			c.Next()
			return
		}
		var user models.User
		if err := repository.DB.First(&user, userID).Error; err != nil {
			delete(session.Values, "user_id")
			session.Save(c.Request, c.Writer)
			c.Next()
			return
		}
		c.Set("currentUser", &user)
		c.Next()
	}
}

// RequireAuth returns 401 if the request has no valid session (for API endpoints).
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, exists := c.Get("currentUser"); !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "로그인이 필요합니다"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RequireAuthPage redirects to /login for unauthenticated page requests.
func RequireAuthPage() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, exists := c.Get("currentUser"); !exists {
			c.Redirect(http.StatusFound, "/login")
			c.Abort()
			return
		}
		c.Next()
	}
}

// GetCurrentUser extracts the logged-in user from the Gin context.
func GetCurrentUser(c *gin.Context) *models.User {
	if user, exists := c.Get("currentUser"); exists {
		return user.(*models.User)
	}
	return nil
}

// ── Login page ──────────────────────────────────────────────────────────────

func LoginPage(c *gin.Context) {
	// Rendered by main.go (needs template + TemplateData).
	// This handler is a no-op; page rendering happens in the route closure.
}

// ── OAuth login redirects ────────────────────────────────────────────────────

func GoogleLogin(c *gin.Context) {
	startOAuth(c, googleConfig())
}

func KakaoLogin(c *gin.Context) {
	startOAuth(c, kakaoConfig())
}

func NaverLogin(c *gin.Context) {
	cfg := naverConfig()
	state := randomState()
	session, _ := Store.Get(c.Request, "runmate-session")
	session.Values["oauth_state"] = state
	session.Save(c.Request, c.Writer)
	// Naver requires 'state' as a query param (not via AuthCodeURL options).
	authURL := fmt.Sprintf("%s?response_type=code&client_id=%s&redirect_uri=%s&state=%s",
		cfg.Endpoint.AuthURL, cfg.ClientID, cfg.RedirectURL, state)
	c.Redirect(http.StatusFound, authURL)
}

func startOAuth(c *gin.Context, cfg *oauth2.Config) {
	state := randomState()
	session, _ := Store.Get(c.Request, "runmate-session")
	session.Values["oauth_state"] = state
	session.Save(c.Request, c.Writer)
	c.Redirect(http.StatusFound, cfg.AuthCodeURL(state))
}

// ── OAuth callbacks ──────────────────────────────────────────────────────────

func GoogleCallback(c *gin.Context) {
	handleCallback(c, "google", googleConfig(), fetchGoogleUser)
}

func KakaoCallback(c *gin.Context) {
	handleCallback(c, "kakao", kakaoConfig(), fetchKakaoUser)
}

func NaverCallback(c *gin.Context) {
	handleCallback(c, "naver", naverConfig(), fetchNaverUser)
}

// ── Logout ───────────────────────────────────────────────────────────────────

func Logout(c *gin.Context) {
	session, _ := Store.Get(c.Request, "runmate-session")
	delete(session.Values, "user_id")
	session.Options.MaxAge = -1
	session.Save(c.Request, c.Writer)
	c.Redirect(http.StatusFound, "/")
}

// ── Current user API ─────────────────────────────────────────────────────────

func GetMe(c *gin.Context) {
	user := GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "로그인이 필요합니다"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

// ── Internal helpers ─────────────────────────────────────────────────────────

type oauthUserInfo struct {
	ID      string
	Name    string
	Email   string
	Picture string
}

func handleCallback(c *gin.Context, provider string, cfg *oauth2.Config, fetchUser func(*oauth2.Token) (*oauthUserInfo, error)) {
	fmt.Printf("[%s] callback 진입 — code=%s state=%s\n", provider, c.Query("code"), c.Query("state"))

	session, err := Store.Get(c.Request, "runmate-session")
	if err != nil {
		fmt.Printf("[%s] session 에러: %v\n", provider, err)
		c.Redirect(http.StatusFound, "/login?error=session")
		return
	}

	state := c.Query("state")
	savedState, _ := session.Values["oauth_state"].(string)
	fmt.Printf("[%s] state 비교 — 받은값=%s 저장값=%s\n", provider, state, savedState)
	if state == "" || state != savedState {
		fmt.Printf("[%s] state 불일치\n", provider)
		c.Redirect(http.StatusFound, "/login?error=state")
		return
	}
	delete(session.Values, "oauth_state")

	token, err := cfg.Exchange(context.Background(), c.Query("code"))
	if err != nil {
		fmt.Printf("[%s] 토큰 교환 에러: %v\n", provider, err)
		c.Redirect(http.StatusFound, "/login?error=token")
		return
	}
	fmt.Printf("[%s] 토큰 교환 성공\n", provider)

	info, err := fetchUser(token)
	if err != nil || info.ID == "" {
		fmt.Printf("[%s] 유저정보 에러: %v info=%+v\n", provider, err, info)
		c.Redirect(http.StatusFound, "/login?error=userinfo")
		return
	}
	fmt.Printf("[%s] 유저정보 성공 — id=%s name=%s\n", provider, info.ID, info.Name)

	var user models.User
	if err := repository.DB.Where("provider = ? AND provider_id = ?", provider, info.ID).First(&user).Error; err != nil {
		user = models.User{
			Name:       info.Name,
			Email:      info.Email,
			Picture:    info.Picture,
			Provider:   provider,
			ProviderID: info.ID,
		}
		repository.DB.Create(&user)
	} else {
		repository.DB.Model(&user).Updates(map[string]interface{}{
			"name":    info.Name,
			"email":   info.Email,
			"picture": info.Picture,
		})
	}

	session.Values["user_id"] = user.ID
	session.Save(c.Request, c.Writer)
	c.Redirect(http.StatusFound, "/")
}

func fetchGoogleUser(token *oauth2.Token) (*oauthUserInfo, error) {
	body, err := oauthGet("https://www.googleapis.com/oauth2/v3/userinfo", token.AccessToken)
	if err != nil {
		return nil, err
	}
	var v struct {
		Sub     string `json:"sub"`
		Name    string `json:"name"`
		Email   string `json:"email"`
		Picture string `json:"picture"`
	}
	if err := json.Unmarshal(body, &v); err != nil {
		return nil, err
	}
	return &oauthUserInfo{ID: v.Sub, Name: v.Name, Email: v.Email, Picture: v.Picture}, nil
}

func fetchKakaoUser(token *oauth2.Token) (*oauthUserInfo, error) {
	body, err := oauthGet("https://kapi.kakao.com/v2/user/me", token.AccessToken)
	fmt.Println("Kakao response:", string(body))
	if err != nil {
		return nil, err
	}
	var v struct {
		ID           int64 `json:"id"`
		KakaoAccount struct {
			Email   string `json:"email"`
			Profile struct {
				Nickname        string `json:"nickname"`
				ProfileImageURL string `json:"profile_image_url"`
			} `json:"profile"`
		} `json:"kakao_account"`
	}
	if err := json.Unmarshal(body, &v); err != nil {
		return nil, err
	}
	return &oauthUserInfo{
		ID:      fmt.Sprintf("%d", v.ID),
		Name:    v.KakaoAccount.Profile.Nickname,
		Email:   v.KakaoAccount.Email,
		Picture: v.KakaoAccount.Profile.ProfileImageURL,
	}, nil
}

func fetchNaverUser(token *oauth2.Token) (*oauthUserInfo, error) {
	body, err := oauthGet("https://openapi.naver.com/v1/nid/me", token.AccessToken)
	if err != nil {
		return nil, err
	}
	var v struct {
		Response struct {
			ID      string `json:"id"`
			Name    string `json:"name"`
			Email   string `json:"email"`
			Profile string `json:"profile_image"`
		} `json:"response"`
	}
	if err := json.Unmarshal(body, &v); err != nil {
		return nil, err
	}
	return &oauthUserInfo{
		ID:      v.Response.ID,
		Name:    v.Response.Name,
		Email:   v.Response.Email,
		Picture: v.Response.Profile,
	}, nil
}

func oauthGet(url, accessToken string) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}
