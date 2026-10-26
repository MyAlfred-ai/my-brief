FROM node:22.23.4-alpine
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg coupe les imports audio longs en tranches de 5 min avant OpenAI
# (lib/audioChunks.js). Le paquet complet : +101 Mo d'image, mesuré le
# 2026-10-15 ; un ffmpeg compilé pour l'audio seul a été écarté.
RUN apk add --no-cache ffmpeg
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js app.js ./
COPY lib ./lib
COPY routes ./routes
USER node
EXPOSE 3000
# 127.0.0.1 et NON localhost : le serveur écoute en IPv4 (0.0.0.0) alors que
# `localhost` résout d'abord en ::1 dans l'image alpine → connexion refusée et
# conteneur marqué unhealthy en permanence, service pourtant sain.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/ping || exit 1
CMD ["node", "server.js"]
