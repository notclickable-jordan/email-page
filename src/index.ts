import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { applyTemplate, generatePageId } from "./helpers";

const app = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Environment variables
const SMTP_HOST: string = process.env.SMTP_HOST || "";
const SMTP_PORT: string = process.env.SMTP_PORT || "";
const SMTP_USER: string = process.env.SMTP_USER || "";
const SMTP_PASS: string = process.env.SMTP_PASS || "";
const DOMAIN_NAME: string = process.env.DOMAIN_NAME || `localhost:${port}`;
const EMAIL_FROM: string = process.env.EMAIL_FROM || "";
const EMAIL_TO: string = process.env.EMAIL_TO || "";

// Set the hash length for page IDs (16-256 characters), default to 32
let HASH_LENGTH: number = 32;
if (process.env.HASH_LENGTH) {
	const parsedLength = parseInt(process.env.HASH_LENGTH, 10);
	if (!isNaN(parsedLength) && parsedLength >= 16 && parsedLength <= 256) {
		HASH_LENGTH = parsedLength;
	} else {
		console.warn(
			`Invalid HASH_LENGTH value: ${process.env.HASH_LENGTH}. Must be a number between 16 and 256. Using default value of 32.`
		);
	}
}

// Set data directory - use environment variable or default
// In Docker: /etc/email-page/data
// In local dev: ./data
const dataDir: string =
	process.env.DATA_DIR ||
	(process.env.NODE_ENV === "test"
		? "./data"
		: process.env.NODE_ENV === "production"
			? "/etc/email-page/data"
			: "./data");

// Set template directory and file - use environment variable or default
const templateDir: string = process.env.TEMPLATE_DIR || path.join(__dirname, "..", "templates");
const templateFile: string = process.env.TEMPLATE_FILE || "default.html";
const templatePath: string = path.join(templateDir, templateFile);

// Ensure data directory exists
try {
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, { recursive: true });
	}
	console.log(`Data directory created/confirmed at: ${dataDir}`);
} catch (error) {
	console.error(`Failed to create data directory at ${dataDir}:`, (error as Error).message);
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
	console.error(`Template setup error: ${(error as Error).message}`);
	// Always throw for template issues as they are critical for functionality
	throw error;
}

// Load the HTML template
let htmlTemplate: string;
try {
	htmlTemplate = fs.readFileSync(templatePath, "utf8");
	console.log("HTML template loaded successfully");
} catch (error) {
	console.error(`Failed to load HTML template: ${(error as Error).message}`);
	// Don't use fallback, consider template loading as critical
	throw error;
}

// Middleware
app.use(bodyParser.json());

// Helper to send email
async function sendEmail(pageUrl: string, title: string): Promise<void> {
	if (!SMTP_HOST || !EMAIL_FROM || !EMAIL_TO) {
		console.log("SMTP configuration incomplete, skipping email send");
		return;
	}

	const transporter = nodemailer.createTransport({
		host: SMTP_HOST,
		port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 25,
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

interface PageRequest {
	title?: string;
	message?: string;
}

// POST endpoint to create a new HTML page
app.post("/new", (req: Request, res: Response) => {
	try {
		const { title, message } = req.body as PageRequest;

		if (!title || !message) {
			res.status(400).json({ error: "Title and message are required" });
			return;
		}

		const pageId = generatePageId(HASH_LENGTH);
		const filename = `page-${pageId}.html`;
		const filePath = path.join(dataDir, filename);

		// Check if message is HTML
		const isHTML = message.toLowerCase().includes("<html");

		let htmlContent: string;
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
		const pageUrl = `http://${DOMAIN_NAME}/${pageId}`;

		// Send email with link to the page
		sendEmail(pageUrl, title);

		// Return success with 204 No Content
		res.status(204).end();
	} catch (error) {
		console.error("Error creating page:", error);
		res.status(500).json({ error: "Failed to create page" });
	}
});

// Wildcard endpoint to serve HTML pages
app.get("/:pageId", (req: Request, res: Response) => {
	try {
		const pageId = req.params.pageId;
		const filePath = path.join(dataDir, `page-${pageId}.html`);

		if (fs.existsSync(filePath)) {
			const content = fs.readFileSync(filePath, "utf8");
			res.setHeader("Content-Type", "text/html");
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
		console.log(`Hash length for page IDs: ${HASH_LENGTH} characters`);
	});
}

// Export for testing
export { app, dataDir, generatePageId, sendEmail };
