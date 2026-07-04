FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++   && rm -rf /var/lib/apt/lists/*

ARG PNPM_VERSION=10.17.0
RUN npm config set registry https://registry.npmmirror.com   && npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app
ENV HUSKY=0

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .
RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "start"]
