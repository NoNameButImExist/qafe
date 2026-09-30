# syntax=docker/dockerfile:1.7
# Backend image for apps/api and apps/worker.
#   docker build -f infra/docker/service.Dockerfile --build-arg APP=api .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
WORKDIR /repo

# Keep only the app and the workspace packages it depends on.
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
RUN pnpm turbo run build --filter=@qafe/${APP}
# Standalone folder: the app, its production deps and built workspace packages.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter=@qafe/${APP} deploy --prod --legacy /out

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health/live" || exit 1
CMD ["node", "--enable-source-maps", "dist/main.js"]
