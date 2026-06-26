FROM node:18-alpine

LABEL maintainer="STEVOUX"
LABEL description="VOUXIFY — Spotify Downloader"

# Install FFmpeg and yt-dlp
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    curl \
  && pip3 install --upgrade --break-system-packages yt-dlp \
  && yt-dlp --version

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Temp downloads directory
RUN mkdir -p downloads && chmod 777 downloads

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "backend/server.js"]
