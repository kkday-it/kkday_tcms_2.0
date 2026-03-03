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

## 4. 驗證

```bash
# 健康檢查
curl http://localhost:19425/api/v1/health

# Log 確認 alembic 與 uvicorn 正常
docker compose logs backend | tail -20
```

## 5. Nginx 反向代理（若使用 /tcms 路徑）

若 TCMS 掛在 `https://host/tcms/` 下，需重建 frontend 並指定 API 路徑：

```bash
docker compose build --build-arg VITE_API_URL=/tcms/api/v1 frontend
docker compose up -d
```

Nginx 設定請參考 `deployment_nginx.md`。

## 6. 網路需求

Backend 需能連線至：
- `SECRET_SERVICE_URL:8000`（get_secret API）
- qa_database 回傳的 `host:port`（PostgreSQL）

若 TCMS 與 autotest-service 同機，`SECRET_SERVICE_URL=http://localhost` 或 `http://127.0.0.1` 可改為內網位址。
