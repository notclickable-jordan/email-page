FROM node:22-alpine

ARG BUILD_DATE

LABEL \
  maintainer="Jordan Roher <jordan@notclickable.com>" \
  org.opencontainers.image.authors="Jordan Roher <jordan@notclickable.com>" \
  org.opencontainers.image.title="email-page" \
  org.opencontainers.image.description="Turn JSON requests into HTML pages and send email links to them" \
  org.opencontainers.image.created=$BUILD_DATE

# Install dependencies for Sharp and fontconfig
RUN apk add --no-cache \
    fontconfig \
    ttf-dejavu \
    vips-dev \
    libc6-compat

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

RUN npm run build

# Create data directory for HTML files
RUN mkdir -p /etc/email-page/data

# Expose the application port
EXPOSE 3000

ENV NODE_ENV=production

# Define environment variables with defaults
ENV PORT=3000 \
    SMTP_HOST="" \
    SMTP_PORT="25" \
    SMTP_USER="" \
    SMTP_PASS="" \
    DOMAIN_NAME="localhost:3000" \
    EMAIL_FROM="" \
    EMAIL_TO="" \
    HASH_LENGTH="32" \
    SHOW_INCOMING="false"

# Ensure proper signal handling
STOPSIGNAL SIGTERM

# Run the application
CMD ["node", "dist/index.js"]
