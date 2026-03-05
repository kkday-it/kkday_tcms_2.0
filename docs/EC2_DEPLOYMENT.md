# TCMS 1.5 EC2 部署檢查清單

## 1. 前置準備

- [ ] EC2 已安裝 Docker 與 Docker Compose
- [ ] 專案已 `git pull` 至最新 `tcms_1.5` 分支
- [ ] 防火牆已開放 8085（Frontend）、19425（Backend）

## 2. 環境變數（backend/.env）

```bash
cd kk_tcms_1.5
cp backend/.env.example backend/.env
# 編輯 backend/.env，填入：
# - USE_QA_DATABASE_SECRET=true
# - SECRET_SERVICE_URL=http://autotest-service.sit.kkday.com
# - AUTOMATION_TOKEN=<從 QA-automation 或 autotest-service 取得>
```

> 敏感資訊（qa_database、production_atlassian）透過 get_secret 取得，不需在 .env 寫 DB 帳密。

## 3. 啟動服務

```bash
docker compose up -d
```

## 4. 建立 Admin 使用者

**方式 A：執行 script（建議，不須登入）**
```bash
docker compose exec backend python scripts/create_admin_user.py
# 自訂帳號：
docker compose exec backend python scripts/create_admin_user.py --email lance@kkday.com --username lance --password 1234
```

**方式 B：呼叫 API（需 Backend 已啟動）**
```bash
curl -X POST http://localhost:19425/api/v1/users/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","role":"Admin","password":"1234"}'
```

## 5. 隱藏頁面：即時 Log

以下 URL **不需要登入**即可直接查看（read-only，隔離於主系統）：

- **FE Log**：`https://autotest-service.sit.kkday.com:8081/tcms/fe-log` — Nginx access log
- **BE Log**：`https://autotest-service.sit.kkday.com:8081/tcms/be-log` — Uvicorn/Backend log

## 6. 驗證

```bash
# 健康檢查
curl http://localhost:19425/api/v1/health

# Log 確認 alembic 與 uvicorn 正常
docker compose logs backend | tail -20
```

## 7. Nginx 反向代理（若使用 /tcms 路徑）

`docker-compose.yml` 已將 `VITE_BASE_URL` 預設為 `/tcms/`，`VITE_API_URL` 預設為 `/tcms/api/v1`。

**直接建立即可，不需額外 `.env`：**

```bash
git pull
docker compose build --no-cache frontend
docker compose up -d
```

### 7.1 部署前備份（強烈建議）

```bash
# 在 EC2 上備份現有 Nginx 設定
sudo cp /etc/nginx/sites-enabled/ai_studio_8080 /etc/nginx/sites-enabled/ai_studio_8080.bak.$(date +%Y%m%d)
```

### 7.2 套用含 TCMS 的 Nginx 設定

```bash
# 從專案目錄複製（先 git pull 取得最新設定檔）
sudo cp kk_tcms_1.5/docs/ai_studio_8080_with_tcms.conf /etc/nginx/sites-enabled/ai_studio_8080
sudo nginx -t && sudo systemctl reload nginx
```

### 7.3 還原備份（若出問題）

```bash
# 還原 EC2 本機備份
sudo cp /etc/nginx/sites-enabled/ai_studio_8080.bak.YYYYMMDD /etc/nginx/sites-enabled/ai_studio_8080
sudo nginx -t && sudo systemctl reload nginx
```

或使用 repo 內的備份檔（加入 TCMS 前的原始設定）：

```bash
sudo cp kk_tcms_1.5/docs/ai_studio_8080_backup_before_tcms.conf /etc/nginx/sites-enabled/ai_studio_8080
sudo nginx -t && sudo systemctl reload nginx
```

Nginx 設定檔說明請參考 `deployment_nginx.md`。

## 7. 疑難排解（登入 / reset password 進不去）

### 8.1 先確認幾件事

| 檢查項目 | 指令 / 方式 |
|----------|--------------|
| Backend 是否正常 | `curl http://localhost:19425/api/v1/health` |
| Frontend 是否用 /tcms build | 開 DevTools → Network，登入時看 API 請求是否打到 `/tcms/api/v1/users/login`（若打到 `/api/v1/` 代表 build 未加 VITE_API_URL） |
| Nginx 是否已套用 | `sudo nginx -t && grep tcms /etc/nginx/sites-enabled/ai_studio_8080` |
| 用戶是否存在 | 用 migrate-passwords 或 DB 確認 `tcms_users` 表有對應帳號 |

### 8.2 常見原因與處理

1. **URL 少了 `/tcms`**
   - 已透過 `BrowserRouter basename` 修正。需**重新 build frontend** 才能生效。
2. **API 打到錯誤路徑**
   - 登入請求應為 `.../tcms/api/v1/users/login`。若打到 `/api/v1/`，代表 frontend 未用正確的 `VITE_API_URL` build。
   - 處理：`docker compose build --no-cache frontend && docker compose up -d`
3. **靜態資源 404（assets/index-xxx.js）**
   - 資源路徑應為 `/tcms/assets/`，若為 `/assets/` 代表 `VITE_BASE_URL` 未設為 `/tcms/`，需重新 build frontend。
4. **密碼不符**
   - 前端用 `crypto-js` SHA-256 hash，後端比對 hash。若曾用 migrate-passwords 設為 `1234`，需確認 hash 正確。
5. **CORS / 404**
   - 確認 Nginx 含 TCMS 設定且已 reload（`sudo systemctl reload nginx`）。

### 8.3 驗證登入流程

```bash
# 1. 健康檢查
curl http://localhost:19425/api/v1/health

# 2. 透過 Nginx（若在 EC2 上）
curl https://autotest-service.sit.kkday.com:8081/tcms/api-health

# 3. 登入 API 測試（需先取得密碼的 SHA-256 hash）
# 例：echo -n "1234" | shasum -a 256
curl -X POST https://autotest-service.sit.kkday.com:8081/tcms/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lance.chien@kkday.com","password":"<SHA256_OF_PASSWORD>"}'
```

---

## 9. 網路需求

Backend 需能連線至：
- `SECRET_SERVICE_URL:8000`（get_secret API）
- qa_database 回傳的 `host:port`（PostgreSQL）

若 TCMS 與 autotest-service 同機，`SECRET_SERVICE_URL=http://localhost` 或 `http://127.0.0.1` 可改為內網位址。
