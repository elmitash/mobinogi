package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	_ "modernc.org/sqlite"
)

var db *sql.DB

// initDB는 SQLite 데이터베이스를 초기화하고 필요한 테이블을 생성합니다.
func initDB() {
	var err error
	db, err = sql.Open("sqlite", "./mobinogi.db")
	if err != nil {
		log.Fatal("DB 연결 실패:", err)
	}

	createTableSQL := `
	CREATE TABLE IF NOT EXISTS mobinogi_checklist (
		sync_id TEXT PRIMARY KEY,
		data_json TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`
	_, err = db.Exec(createTableSQL)
	if err != nil {
		log.Fatal("테이블 생성 실패:", err)
	}
}

// handleAPI는 기존 api.php의 모든 기능을 Go 핸들러로 구현한 함수입니다.
func handleAPI(w http.ResponseWriter, r *http.Request) {
	action := r.URL.Query().Get("action")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	
	// CORS 처리 (로컬 개발 편의용)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch action {
	case "data":
		if r.Method == "GET" {
			syncID := r.URL.Query().Get("sync_id")
			if len(syncID) != 8 {
				http.Error(w, `{"error":"invalid sync_id"}`, http.StatusBadRequest)
				return
			}
			var dataJSON string
			err := db.QueryRow("SELECT data_json FROM mobinogi_checklist WHERE sync_id = ?", syncID).Scan(&dataJSON)
			if err == sql.ErrNoRows {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			} else if err != nil {
				http.Error(w, `{"error":"server error"}`, http.StatusInternalServerError)
				return
			}
			// 이미 JSON 형태이므로 그대로 출력
			fmt.Fprintf(w, `{"data":%s}`, dataJSON)

		} else if r.Method == "POST" {
			body, _ := io.ReadAll(r.Body)
			var input struct {
				SyncID string          `json:"sync_id"`
				Data   json.RawMessage `json:"data"`
			}
			if err := json.Unmarshal(body, &input); err != nil || len(input.SyncID) != 8 {
				http.Error(w, `{"error":"invalid input"}`, http.StatusBadRequest)
				return
			}
			dataBytes, _ := json.Marshal(input.Data)
			_, err := db.Exec(`
				INSERT INTO mobinogi_checklist (sync_id, data_json) VALUES (?, ?)
				ON CONFLICT(sync_id) DO UPDATE SET data_json=excluded.data_json, updated_at=CURRENT_TIMESTAMP`,
				input.SyncID, string(dataBytes))
			if err != nil {
				log.Println("Save error:", err)
				http.Error(w, `{"error":"save failed"}`, http.StatusInternalServerError)
				return
			}
			fmt.Fprint(w, `{"result":"ok"}`)
		}

	case "shortcode":
		shortCode := r.URL.Query().Get("short_code")
		if len(shortCode) != 8 {
			http.Error(w, `{"error":"invalid short_code"}`, http.StatusBadRequest)
			return
		}
		var syncID string
		err := db.QueryRow("SELECT sync_id FROM mobinogi_checklist WHERE sync_id = ?", shortCode).Scan(&syncID)
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		fmt.Fprintf(w, `{"sync_id":"%s"}`, syncID)

	case "delete":
		if r.Method == "POST" {
			body, _ := io.ReadAll(r.Body)
			var input struct {
				SyncID string `json:"sync_id"`
			}
			json.Unmarshal(body, &input)
			if len(input.SyncID) != 8 {
				http.Error(w, `{"error":"invalid sync_id"}`, http.StatusBadRequest)
				return
			}
			res, _ := db.Exec("DELETE FROM mobinogi_checklist WHERE sync_id = ?", input.SyncID)
			rows, _ := res.RowsAffected()
			if rows == 0 {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			}
			fmt.Fprint(w, `{"result":"deleted"}`)
		}

	default:
		http.Error(w, `{"error":"invalid endpoint"}`, http.StatusNotFound)
	}
}

func main() {
	initDB()
	defer db.Close()

	// API 핸들러 등록 (api.php와 동일한 경로 사용)
	http.HandleFunc("/api.php", handleAPI)

	// 정적 파일 서빙 (HTML, JS, CSS)
	fs := http.FileServer(http.Dir("."))
	http.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 보안 및 접근 제어
		if r.URL.Path == "/config.php" || r.URL.Path == "/api.php" && r.Method != "GET" && r.Method != "POST" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		
		// 동기화 코드(8자리)가 포함된 URL 요청 시 index.html 서빙 (SPA 지원)
		if r.URL.Path != "/" && !strings.Contains(r.URL.Path, ".") {
			path := strings.TrimPrefix(r.URL.Path, "/")
			if len(path) == 8 {
				http.ServeFile(w, r, "index.html")
				return
			}
		}

		fs.ServeHTTP(w, r)
	}))

	port := "8080"
	fmt.Printf("마비노기 로컬 테스트 서버가 시작되었습니다: http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
