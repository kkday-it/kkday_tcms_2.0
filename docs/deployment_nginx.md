# TCMS Deployment Configuration

This guide helps you integrate TCMS into your existing Nginx infrastructure, following the pattern used for `Issue Analyst`.

> **單一容器架構**：前端與後端已整併為單一容器，對外只暴露**一個 port（`8085`）**。
> 前端靜態檔與 `/api/v1/*` 都由容器內的 FastAPI 提供，所以 host nginx 只需**一段 location**，
> 不再需要把 `/assets`、`/api`、`/docs` 拆到不同 port。

## 1. `docker-compose.yml`

單一 service `app`，對外 `8085 → 8000`：

```yaml
services:
  app:
    # ...
    ports:
      - "8085:8000"   # host 8085 → 容器內 uvicorn 8000（前端 + API 同一 port）
```

## 2. Nginx Configuration

Add the following to your `/etc/nginx/sites-enabled/ai_studio_8080` file within the `server` block (listening on port 8081):

```nginx
    # ========================================================
    # TCMS 專案設定（單一容器：前端 + API 同在 8085）
    # ========================================================

    # 自動補上斜線
    location = /tcms {
        return 301 /tcms/;
    }

    # 前端 + API 全部走同一段：nginx 剝掉 /tcms 前綴後轉給容器，
    # 容器內 FastAPI(root_path=/tcms) 同時 serve SPA 靜態檔與 /api/v1/*。
    location ^~ /tcms/ {
        rewrite ^/tcms/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }
```

> 對照舊的雙容器版：以前要 5 段 location（`/tcms/api/v1/health`、`/tcms/assets/`、`/tcms/docs`、
> `/tcms/api/v1/`、`/tcms/` 各自指向 8085 或 19425）。整併後全部收斂成上面這一段。

## 3. (Optional) 直接用 port 8085 存取

若也想直接 `http://autotest-service.sit.kkday.com:8085/` 存取（不透過 /tcms），
該容器需以 root 模式 build（`VITE_BASE_URL=/`、`ROOT_PATH=`）。此時容器本身即在 `/` 提供
前端與 `/api/v1/*`，不需要額外 nginx server block。

> [!TIP]
> 修改設定後務必 `sudo nginx -t` 檢查語法，再 `sudo systemctl reload nginx`。
