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

// Set template directory and file - use environment variable or default
const templateDir = process.env.TEMPLATE_DIR || path.join(__dirname, "templates");
const templateFile = process.env.TEMPLATE_FILE || "default.html";
const templatePath = path.join(templateDir, templateFile);

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

// Ensure template directory exists
try {
	if (!fs.existsSync(templateDir)) {
		fs.mkdirSync(templateDir, { recursive: true });
	}
	console.log(`Template directory created/confirmed at: ${templateDir}`);

	// Check if template file exists and throw error if it doesn't
	if (!fs.existsSync(templatePath)) {
		const errorMessage = `Template file not found at ${templatePath}. Please create the template file before running the application.`;
		console.error(errorMessage);
		throw new Error(errorMessage);
	}
	console.log(`Using template file: ${templatePath}`);
} catch (error) {
	console.error(`Template setup error: ${error.message}`);
	// Always throw for template issues as they are critical for functionality
	throw error;
}

// Load the HTML template
let htmlTemplate;
try {
	htmlTemplate = fs.readFileSync(templatePath, "utf8");
	console.log("HTML template loaded successfully");
} catch (error) {
	console.error(`Failed to load HTML template: ${error.message}`);
	// Don't use fallback, consider template loading as critical
	throw error;
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

// Helper function to apply template
function applyTemplate(template, data) {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
		return data[key] !== undefined ? data[key] : match;
	});
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
			// Convert newlines to <br/> tags before applying the template
			const formattedMessage = message.replace(/\n/g, "<br/>");

			// Apply template with title and formatted message
			htmlContent = applyTemplate(htmlTemplate, {
				title: title,
				message: formattedMessage,
			});
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
		console.log(`Template file: ${templatePath}`);
	});
}

// Export for testing
module.exports = { app, dataDir, generateTimestamp, sendEmail };
