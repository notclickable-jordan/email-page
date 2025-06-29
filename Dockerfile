FROM node:22

ARG BUILD_DATE

LABEL \
  maintainer="Jordan Roher <jordan@notclickable.com>" \
  org.opencontainers.image.authors="Jordan Roher <jordan@notclickable.com>" \
  org.opencontainers.image.title="email-page" \
  org.opencontainers.image.description="Turn JSON requests into HTML pages and send email links to them" \
  org.opencontainers.image.created=$BUILD_DATE

# Prepare Puppeteer dependencies
# Install Chrome and fonts to support major charsets (Chinese, Japanese, Arabic, Hebrew, Thai and a few others)
# Note: this installs the necessary libs to make the bundled version of Chrome for Testing that Puppeteer
# installs, work.
RUN apt-get update \
    && apt-get install -y wget gnupg ca-certificates \
    && wget -q -O /tmp/google-chrome-stable_current_amd64.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y /tmp/google-chrome-stable_current_amd64.deb fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* /tmp/google-chrome-stable_current_amd64.deb

# Add user so we don't need --no-sandbox
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser

# Install puppeteer globally so it's available in the container
RUN npm install -g puppeteer

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

# Run the application
CMD ["node", "dist/index.js"]
