# GHCR 自动构建与一键更新

## 自动构建镜像

- 已新增 GitHub Actions: `.github/workflows/docker-ghcr.yml`
- 每次推送到 `main` 会自动构建并推送:
  - `ghcr.io/guxi666/guxiapi:latest`
  - `ghcr.io/guxi666/guxiapi:<commit-sha>`

## 服务器部署

1. 复制 `deploy/docker-compose.ghcr.yml` 到服务器作为 `docker-compose.yml`
2. 将其中 `CHANGE_ME` 和 `SESSION_SECRET` 改成你的真实值
3. 启动:

```bash
docker compose up -d
```

## 后续更新

每次你 `git push` 到 `main` 后，服务器执行:

```bash
docker compose pull
docker compose up -d
```
