# syntax=docker/dockerfile:1.7
# Static frontend image (guest, staff, panel, admin, web) served by unprivileged nginx.
#   docker build -f infra/docker/web.Dockerfile --build-arg APP=guest .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
WORKDIR /repo

FROM base AS prune
ARG APP
ARG TURBO_VERSION=2.11.5
COPY . .
RUN pnpm dlx turbo@${TURBO_VERSION} prune @qafe/${APP} --docker

FROM base AS deps
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ARG APP
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build --filter=@qafe/${APP} \
 && mv apps/${APP}/dist /site

FROM nginxinc/nginx-unprivileged:1-alpine AS runtime
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health/live || exit 1
