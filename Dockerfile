FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm install && npm run build
EXPOSE 8787
CMD ["node", "scripts/docker-start.mjs"]
