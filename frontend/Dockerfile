FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_JEV_AGENT_URL=http://127.0.0.1:8765/mcp
ENV VITE_JEV_AGENT_URL=$VITE_JEV_AGENT_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
