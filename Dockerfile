FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Create data directory for HTML files
RUN mkdir -p /etc/email-page/data

# Expose the application port
EXPOSE 3000

# Define environment variables with defaults
ENV PORT=3000 \
    SMTP_HOST="" \
    SMTP_PORT="25" \
    SMTP_USER="" \
    SMTP_PASS="" \
    DOMAIN_NAME="localhost:3000" \
    EMAIL_FROM="" \
    EMAIL_TO="" \
    HASH_LENGTH="32"

# Run the application
CMD ["node", "index.js"]
