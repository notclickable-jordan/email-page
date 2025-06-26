# Email Page

A Docker service that creates HTML pages from POST requests and sends email links to the generated pages.

## Features

- Creates HTML pages from POST requests
- Handles both plain text and HTML content
- Sends email notifications with links to the created pages
- Serves the HTML pages via unique URLs

## Environment Variables

| Variable    | Description                     | Default              |
| ----------- | ------------------------------- | -------------------- |
| PORT        | Server port                     | 3000                 |
| SMTP_HOST   | SMTP server host                | (required for email) |
| SMTP_PORT   | SMTP server port                | 25                   |
| SMTP_USER   | SMTP username                   | (optional)           |
| SMTP_PASS   | SMTP password                   | (optional)           |
| DOMAIN_NAME | Domain name for generated links | localhost:3000       |
| EMAIL_FROM  | Sender email address            | (required for email) |
| EMAIL_TO    | Recipient email address         | (required for email) |

## API Endpoints

### POST /new

Creates a new HTML page.

**Request Body:**

```json
{
	"title": "Page Title",
	"message": "Page content goes here.\nThis will be converted to HTML."
}
```

If the message contains `<html>` tags, the entire message will be used as the HTML content.

**Response:**

- 204 No Content on success
- 400 Bad Request if title or message is missing
- 500 Internal Server Error if page creation fails

### GET /:pageId

Serves an HTML page by its ID (timestamp).

For example, `/2025-01-02-143376` will serve the file `/etc/email-page/data/page-2025-01-02-143376.html`.

**Response:**

- HTML content of the page
- 404 Not Found if page doesn't exist
- 500 Internal Server Error if page serving fails

## Building and Running with Docker

1. Build the Docker image:

    ```
    docker build -t emailpage .
    ```

2. Run the container:

    ```
    docker run -p 3000:3000 \
      -e SMTP_HOST=smtp.example.com \
      -e SMTP_PORT=587 \
      -e SMTP_USER=user@example.com \
      -e SMTP_PASS=password \
      -e DOMAIN_NAME=example.com \
      -e EMAIL_FROM=notifications@example.com \
      -e EMAIL_TO=recipient@example.com \
      -v /path/to/local/data:/etc/email-page/data \
      emailpage
    ```

3. Or use with docker-compose:
   Create a `docker-compose.yml` file with the following content:

```yaml
services:
    email-page:
        image: jordanroher/email-page
        container_name: email-page
        ports:
            - 3000:3000
        environment:
            - SMTP_HOST=smtp.example.com
            - SMTP_PORT=587
            - SMTP_USER=username
            - SMTP_PASS=password
            - DOMAIN_NAME=email-page.example.com
            - EMAIL_FROM=email-page@example.com
            - EMAIL_TO=notifications@example.com
        volumes:
            - data:/etc/email-page/data

volumes:
    data:
```

Then run:

```bash
# Create a local data directory if it doesn't exist
mkdir -p data

# Start the service
docker-compose up -d
```

## Testing

You can test the API with curl:

```bash
curl -X POST http://localhost:3000/new \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Page","message":"Hello, world!\nThis is a test page."}'
```
