# Etapa de build: ferramentas para compilar o better-sqlite3 caso o binário pronto não esteja disponível
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

# Imagem final enxuta
FROM node:22-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .
# O volume persistente é criado no painel da hospedagem (Railway não aceita VOLUME no Dockerfile)
ENV NODE_ENV=production DATA_DIR=/data TZ=America/Sao_Paulo
EXPOSE 3000
CMD ["node", "src/server.js"]
