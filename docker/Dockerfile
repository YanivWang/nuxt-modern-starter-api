ARG PNPM_VERSION=10.17.0
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV HUSKY=0
ARG PNPM_VERSION
ARG NPM_REGISTRY=
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
  && npm install -g pnpm@${PNPM_VERSION}

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm run build

FROM base AS prod-deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV APP_ENV=production
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_TO_FILE=false

RUN groupadd --system nodejs && useradd --system --gid nodejs --home /app nodejs \
  && mkdir -p /app/uploads /app/.data \
  && chown -R nodejs:nodejs /app

COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/docs ./docs
COPY --from=build --chown=nodejs:nodejs /app/package.json ./package.json

USER nodejs
EXPOSE 3000

CMD ["node", "dist/server.js"]
