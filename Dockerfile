FROM node:24-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV ORAVIA_RUNTIME_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV ORAVIA_DATA_DIR=/data
RUN useradd --system --uid 1001 --create-home oravia \
  && mkdir -p /data \
  && chown -R oravia:oravia /data /app
COPY --from=builder --chown=oravia:oravia /app/.next/standalone ./
COPY --from=builder --chown=oravia:oravia /app/.next/static ./.next/static
COPY --from=builder --chown=oravia:oravia /app/package.json ./package.json
COPY --from=deps --chown=oravia:oravia /app/node_modules ./node_modules
COPY --from=builder --chown=oravia:oravia /app/scripts/start-production.js ./scripts/start-production.js
COPY --from=builder --chown=oravia:oravia /app/scripts/db-backup.js ./scripts/db-backup.js
COPY --from=builder --chown=oravia:oravia /app/scripts/db-restore.js ./scripts/db-restore.js
COPY --from=builder --chown=oravia:oravia /app/scripts/empty-slots-run-once.js ./scripts/empty-slots-run-once.js
COPY --from=builder --chown=oravia:oravia /app/src ./src
USER oravia
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-production.js"]
