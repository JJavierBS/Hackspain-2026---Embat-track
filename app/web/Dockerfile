# Build context is the repository root (see docker-compose.yml), because
# this workspace package depends on packages/shared as a sibling package.

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/package.json
COPY web/package.json web/package.json
RUN corepack use pnpm@11.9.0 && pnpm install --frozen-lockfile=false
COPY packages/shared packages/shared
COPY web web
RUN pnpm --filter web run build

FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/web/dist /usr/share/nginx/html
EXPOSE 80
