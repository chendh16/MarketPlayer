# Skill 服务器配置示例

## 本地开发环境

```bash
# .env.local
# Skill 服务器端口配置
SKILL_US_PORT=3101
SKILL_A_PORT=3102
SKILL_HK_PORT=3103
SKILL_BTC_PORT=3104

# 可选 API Keys
COINGECKO_API_KEY=your_coingecko_key_here

# NEWS_ADAPTERS 配置（使用本地 Skill 服务器）
NEWS_ADAPTERS='[{"name":"us-skill","type":"skill","config":{"skillName":"us-stock-news","skillEndpoint":"http://localhost:3101","timeout":30000},"markets":["us"],"priority":5,"enabled":true},{"name":"a-skill","type":"skill","config":{"skillName":"a-stock-news","skillEndpoint":"http://localhost:3102","timeout":30000},"markets":["a"],"priority":5,"enabled":true},{"name":"hk-skill","type":"skill","config":{"skillName":"hk-stock-news","skillEndpoint":"http://localhost:3103","timeout":30000},"markets":["hk"],"priority":5,"enabled":true},{"name":"btc-skill","type":"skill","config":{"skillName":"btc-news","skillEndpoint":"http://localhost:3104","timeout":30000},"markets":["btc"],"priority":5,"enabled":true}]'
```

## 生产环境（远程 Skill 服务器）

```bash
# .env.production
# NEWS_ADAPTERS 配置（使用远程 Skill 服务器）
NEWS_ADAPTERS='[{"name":"us-skill","type":"skill","config":{"skillName":"us-stock-news","skillEndpoint":"https://skills.example.com:3101","timeout":30000},"markets":["us"],"priority":5,"enabled":true},{"name":"a-skill","type":"skill","config":{"skillName":"a-stock-news","skillEndpoint":"https://skills.example.com:3102","timeout":30000},"markets":["a"],"priority":5,"enabled":true},{"name":"hk-skill","type":"skill","config":{"skillName":"hk-stock-news","skillEndpoint":"https://skills.example.com:3103","timeout":30000},"markets":["hk"],"priority":5,"enabled":true},{"name":"btc-skill","type":"skill","config":{"skillName":"btc-news","skillEndpoint":"https://skills.example.com:3104","timeout":30000},"markets":["btc"],"priority":5,"enabled":true}]'
```

## Docker Compose 环境

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Skill 服务器集群
  skill-servers:
    build:
      context: .
      dockerfile: Dockerfile.skills
    ports:
      - "3101:3101"
      - "3102:3102"
      - "3103:3103"
      - "3104:3104"
    environment:
      - SKILL_US_PORT=3101
      - SKILL_A_PORT=3102
      - SKILL_HK_PORT=3103
      - SKILL_BTC_PORT=3104
      - COINGECKO_API_KEY=${COINGECKO_API_KEY}
    restart: unless-stopped
    networks:
      - marketplayer

  # 主应用
  app:
    build: .
    depends_on:
      - skill-servers
      - postgres
      - redis
    environment:
      - NEWS_ADAPTERS=[{"name":"us-skill","type":"skill","config":{"skillName":"us-stock-news","skillEndpoint":"http://skill-servers:3101","timeout":30000},"markets":["us"],"priority":5,"enabled":true},{"name":"a-skill","type":"skill","config":{"skillName":"a-stock-news","skillEndpoint":"http://skill-servers:3102","timeout":30000},"markets":["a"],"priority":5,"enabled":true},{"name":"hk-skill","type":"skill","config":{"skillName":"hk-stock-news","skillEndpoint":"http://skill-servers:3103","timeout":30000},"markets":["hk"],"priority":5,"enabled":true},{"name":"btc-skill","type":"skill","config":{"skillName":"btc-news","skillEndpoint":"http://skill-servers:3104","timeout":30000},"markets":["btc"],"priority":5,"enabled":true}]
    networks:
      - marketplayer

networks:
  marketplayer:
    driver: bridge
```

## Kubernetes 配置

```yaml
# k8s/skill-servers-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: skill-servers
spec:
  replicas: 2
  selector:
    matchLabels:
      app: skill-servers
  template:
    metadata:
      labels:
        app: skill-servers
    spec:
      containers:
      - name: skill-servers
        image: marketplayer/skill-servers:latest
        ports:
        - containerPort: 3101
          name: us-skill
        - containerPort: 3102
          name: a-skill
        - containerPort: 3103
          name: hk-skill
        - containerPort: 3104
          name: btc-skill
        env:
        - name: SKILL_US_PORT
          value: "3101"
        - name: SKILL_A_PORT
          value: "3102"
        - name: SKILL_HK_PORT
          value: "3103"
        - name: SKILL_BTC_PORT
          value: "3104"
        - name: COINGECKO_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: coingecko
        livenessProbe:
          httpGet:
            path: /health
            port: 3101
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3101
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: skill-servers
spec:
  selector:
    app: skill-servers
  ports:
  - name: us-skill
    port: 3101
    targetPort: 3101
  - name: a-skill
    port: 3102
    targetPort: 3102
  - name: hk-skill
    port: 3103
    targetPort: 3103
  - name: btc-skill
    port: 3104
    targetPort: 3104
```

## PM2 Ecosystem 配置

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'skill-us',
      script: 'npx',
      args: 'ts-node scripts/skill-us-server.ts',
      env: {
        SKILL_US_PORT: 3101,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'skill-a',
      script: 'npx',
      args: 'ts-node scripts/skill-a-server.ts',
      env: {
        SKILL_A_PORT: 3102,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'skill-hk',
      script: 'npx',
      args: 'ts-node scripts/skill-hk-server.ts',
      env: {
        SKILL_HK_PORT: 3103,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'skill-btc',
      script: 'npx',
      args: 'ts-node scripts/skill-btc-server.ts',
      env: {
        SKILL_BTC_PORT: 3104,
        COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
  ],
};
```

使用方法：
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Nginx 反向代理配置

```nginx
# /etc/nginx/sites-available/skill-servers
upstream skill_us {
    server localhost:3101;
}

upstream skill_a {
    server localhost:3102;
}

upstream skill_hk {
    server localhost:3103;
}

upstream skill_btc {
    server localhost:3104;
}

server {
    listen 80;
    server_name skills.example.com;

    # US Stock Skill
    location /us/ {
        proxy_pass http://skill_us/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # A Stock Skill
    location /a/ {
        proxy_pass http://skill_a/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # HK Stock Skill
    location /hk/ {
        proxy_pass http://skill_hk/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # BTC Skill
    location /btc/ {
        proxy_pass http://skill_btc/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Health checks
    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/skill-servers /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 测试脚本

```bash
#!/bin/bash
# test-skills.sh - 测试所有 Skill 服务器

echo "Testing Skill Servers..."
echo "========================"

# 测试 US Skill
echo -e "\n[US Stock Skill]"
curl -s http://localhost:3101/health | jq .
curl -s -X POST http://localhost:3101/ \
  -H "Content-Type: application/json" \
  -d '{"action":"fetchNews","parameters":{"market":"us","limit":2}}' | jq '.items | length'

# 测试 A Skill
echo -e "\n[A Stock Skill]"
curl -s http://localhost:3102/health | jq .
curl -s -X POST http://localhost:3102/ \
  -H "Content-Type: application/json" \
  -d '{"action":"fetchNews","parameters":{"market":"a","limit":2}}' | jq '.items | length'

# 测试 HK Skill
echo -e "\n[HK Stock Skill]"
curl -s http://localhost:3103/health | jq .
curl -s -X POST http://localhost:3103/ \
  -H "Content-Type: application/json" \
  -d '{"action":"fetchNews","parameters":{"market":"hk","limit":2}}' | jq '.items | length'

# 测试 BTC Skill
echo -e "\n[BTC Skill]"
curl -s http://localhost:3104/health | jq .
curl -s -X POST http://localhost:3104/ \
  -H "Content-Type: application/json" \
  -d '{"action":"fetchNews","parameters":{"market":"btc","limit":2}}' | jq '.items | length'

echo -e "\n========================"
echo "All tests completed!"
```

使用方法：
```bash
chmod +x test-skills.sh
./test-skills.sh
```

## 监控配置（Prometheus）

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'skill-servers'
    static_configs:
      - targets:
          - 'localhost:3101'
          - 'localhost:3102'
          - 'localhost:3103'
          - 'localhost:3104'
    metrics_path: '/metrics'
    scrape_interval: 30s
```

## 日志配置（Logrotate）

```
# /etc/logrotate.d/skill-servers
/var/log/skill-servers/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 marketplayer marketplayer
    sharedscripts
    postrotate
        systemctl reload skill-servers > /dev/null 2>&1 || true
    endscript
}
```
