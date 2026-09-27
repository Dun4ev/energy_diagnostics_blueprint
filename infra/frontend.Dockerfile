FROM node:25.1.0-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./

RUN npm ci

COPY apps/web/ ./apps/web/
COPY config/ ./config/
COPY contracts/fixtures/ ./contracts/fixtures/

RUN npm run build

FROM nginx:1.29.3-alpine

COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist/ /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
