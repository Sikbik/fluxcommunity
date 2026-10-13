# syntax=docker/dockerfile:1

# ---- Stage 1: build the web bundle ------------------------------------------------------------
# The web app imports ../shared (types and the catalog), so both folders are laid out as in the repo.
FROM node:24-alpine AS web
WORKDIR /build
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci --no-audit --no-fund
COPY shared ./shared
COPY web ./web
RUN npm --prefix web run build

# ---- Stage 2: runtime ------------------------------------------------------------------------
# Zero runtime dependencies: the server is TypeScript run directly by Node (type stripping), so the
# image only needs the server sources, shared/ and the built web bundle.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=42069 \
    HOST=0.0.0.0 \
    WEB_DIST=/app/web \
    LOG_LEVEL=info
WORKDIR /app

# A package.json with "type": "module" at /app makes shared/*.ts load as ES modules.
RUN printf '{"name":"flux-community","private":true,"type":"module"}\n' > package.json
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY shared ./shared
COPY --from=web /build/web/dist ./web

USER node
EXPOSE 42069

# /healthz answers plain "ok"; busybox wget ships with alpine so no extra process start-up cost.
HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "server/src/main.ts"]
