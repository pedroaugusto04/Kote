FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src
COPY scripts ./scripts
RUN npm run build:api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/backend/dist ./backend/dist
RUN mkdir -p /app/dist/frontend /var/log/knowledge-base-api
EXPOSE 4310
CMD ["node", "backend/dist/main.js"]
