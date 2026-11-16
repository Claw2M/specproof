FROM node:22.14-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/tsconfig.json ./packages/core/
COPY packages/mutator/package.json packages/mutator/tsconfig.json ./packages/mutator/
COPY packages/mcp-server/package.json packages/mcp-server/tsconfig.json ./packages/mcp-server/
COPY packages/cli/package.json packages/cli/tsconfig.json ./packages/cli/
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/

RUN npm ci

COPY packages ./packages
COPY apps ./apps
RUN npm run build && npm prune --omit=dev

FROM node:22.14-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4310
ENV SPECPROOF_DB_PATH=/data/cloud.sqlite

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /data && chown -R node:node /data /app
USER node

VOLUME ["/data"]
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4310/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/dist/bin.js"]
