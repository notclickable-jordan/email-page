const express = require("express");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const app = express();
const port = process.env.PORT || 3000;

// Environment variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const DOMAIN_NAME = process.env.DOMAIN_NAME || "localhost:" + port;
const EMAIL_FROM = process.env.EMAIL_FROM;
const EMAIL_TO = process.env.EMAIL_TO;

// Set data directory - use environment variable or default
// In Docker: /etc/email-page/data
// In local dev: ./data
const dataDir =
	process.env.DATA_DIR ||
	(process.env.NODE_ENV === "test"
		? "./data"
		: process.env.NODE_ENV === "production"
			? "/etc/email-page/data"
			: "./data");

// Ensure data directory exists
try {
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, { recursive: true });
	}
	console.log(`Data directory created/confirmed at: ${dataDir}`);
} catch (error) {
	console.error(`Failed to create data directory at ${dataDir}:`, error.message);
	// Don't throw in production, just log the error
	if (process.env.NODE_ENV === "test") {
		throw error;
	}
}

// Middleware
app.use(bodyParser.json());

// Helper to generate timestamp for filenames
function generateTimestamp() {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const hours = String(now.getHours()).padStart(2, "0");
	const minutes = String(now.getMinutes()).padStart(2, "0");
	const seconds = String(now.getSeconds()).padStart(2, "0");
	const milliseconds = String(now.getMilliseconds()).padStart(3, "0");

	return `${year}-${month}-${day}-${hours}${minutes}${seconds}${milliseconds}`;
}

// Helper to send email
async function sendEmail(pageUrl, title) {
	if (!SMTP_HOST || !EMAIL_FROM || !EMAIL_TO) {
		console.log("SMTP configuration incomplete, skipping email send");
		return;
	}

	const transporter = nodemailer.createTransport({
		host: SMTP_HOST,
		port: SMTP_PORT || 25,
		secure: SMTP_PORT === "465",
		auth:
			SMTP_USER && SMTP_PASS
				? {
						user: SMTP_USER,
						pass: SMTP_PASS,
					}
				: undefined,
	});

	const mailOptions = {
		from: EMAIL_FROM,
		to: EMAIL_TO,
		subject: `New page created: ${title}`,
		text: `A new page has been created titled "${title}". View it at: ${pageUrl}`,
		html: `<p>A new page has been created titled <strong>"${title}"</strong>.</p><p>View it at: <a href="${pageUrl}">${pageUrl}</a></p>`,
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		console.log("Email sent:", info.messageId);
	} catch (error) {
		console.error("Error sending email:", error);
	}
}

// POST endpoint to create a new HTML page
app.post("/new", (req, res) => {
	try {
		const { title, message } = req.body;

		if (!title || !message) {
			return res.status(400).send({ error: "Title and message are required" });
		}

		const timestamp = generateTimestamp();
		const filename = `page-${timestamp}.html`;
		const filePath = path.join(dataDir, filename);

		// Check if message is HTML
		const isHTML = message.toLowerCase().includes("<html");

		let htmlContent;
		if (isHTML) {
			htmlContent = message;
		} else {
			htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      color: #333;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div>${message.replace(/\n/g, "<br/>")}</div>
</body>
</html>`;
		}

		// Write the HTML file
		fs.writeFileSync(filePath, htmlContent);
		console.log(`Page created: ${filename}`);

		// Generate page URL
		const pageId = timestamp;
		const pageUrl = `http://${DOMAIN_NAME}/${pageId}`;

		// Send email with link to the page
		sendEmail(pageUrl, title);

		// Return success with 204 No Content
		res.status(204).end();
	} catch (error) {
		console.error("Error creating page:", error);
		res.status(500).send({ error: "Failed to create page" });
	}
});

// Wildcard endpoint to serve HTML pages
app.get("/:pageId", (req, res) => {
	try {
		const pageId = req.params.pageId;
		const filePath = path.join(dataDir, `page-${pageId}.html`);

		if (fs.existsSync(filePath)) {
			const content = fs.readFileSync(filePath, "utf8");
			res.header("Content-Type", "text/html");
			res.send(content);
		} else {
			res.status(404).send("Page not found");
		}
	} catch (error) {
		console.error("Error serving page:", error);
		res.status(500).send("Error serving page");
	}
});

// Start the server if this file is run directly
if (require.main === module) {
	app.listen(port, () => {
		console.log(`Email page server running on port ${port}`);
		console.log(`Data directory: ${dataDir}`);
	});
}

// Export for testing
module.exports = { app, dataDir, generateTimestamp, sendEmail };
