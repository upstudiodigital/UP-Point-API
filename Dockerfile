FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333
EXPOSE 3333
USER node
CMD ["node", "dist/server.js"]
