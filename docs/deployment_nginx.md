# TCMS 1.5 Deployment Configuration

This guide helps you integrate TCMS 1.5 into your existing Nginx infrastructure, following the pattern used for `Issue Analyst`.

## 1. Update `docker-compose.yml`

To match your naming convention (FE: 8085, BE: 19425), please update the `ports` section in your `docker-compose.yml`:

```yaml
services:
  backend:
    # ... other settings
    ports:
      - "19425:8000"  # Mapping host 19425 to container 8000

  frontend:
    # ... other settings
    ports:
      - "8085:80"     # Mapping host 8085 to container 80 (Nginx)
```

## 2. Nginx Configuration Update

Add the following section to your `/etc/nginx/sites-enabled/ai_studio_8080` file within the `server` block (listening on port 8081):

```nginx
    # ========================================================
    # V3: TCMS 1.5 專案設定 (Frontend: 8085, Backend: 19425)
    # ========================================================

    # 自動補上斜線
    location = /tcms {
        return 301 /tcms/;
    }

    # 健康檢查 (TCMS) -> Port 19425
    location = /tcms/api/v1/health {
        proxy_pass http://127.0.0.1:19425/api/v1/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # 靜態資源 (TCMS) -> Port 8085
    location ^~ /tcms/assets/ {
        proxy_pass http://127.0.0.1:8085/assets/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # FastAPI 文檔頁面 (TCMS) -> Port 19425
    location = /tcms/docs {
        proxy_pass http://127.0.0.1:19425/api/v1/docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # FastAPI API 路由 (TCMS) -> Port 19425
    location ^~ /tcms/api/v1/ {
        proxy_pass http://127.0.0.1:19425/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA 客戶端 (TCMS) -> Port 8085 (Frontend)
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

## 3. (Optional) Separate Port 8085 Access

If you also want to access TCMS directly via port 8085 (e.g., `http://autotest-service.sit.kkday.com:8085/`), you can add a separate server block:

```nginx
server {
    listen 8085;
    server_name autotest-service.sit.kkday.com;

    location / {
        proxy_pass http://127.0.0.1:8085; # Frontend
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:19425/api/v1/; # Backend
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

> [!TIP]
> After modifying the configuration, always run `sudo nginx -t` to check for syntax errors before reloading with `sudo systemctl reload nginx`.
