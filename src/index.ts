import express, { Request, Response } from "express";
import bodyParser from "body-parser";

import fs from "fs";
import path from "path";
import { applyTemplate, generatePageId, sendEmail } from "./helpers";
import { defaults, IConfig } from "./types";

const app = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : defaults.port;

// Environment variables
const config: IConfig = {
	smtp: {
		host: process.env.SMTP_HOST || "",
		port: process.env.SMTP_PORT || "",
		user: process.env.SMTP_USER || "",
		pass: process.env.SMTP_PASS || "",
	},
	domain: process.env.DOMAIN_NAME || `localhost:${port}`,
	email: {
		from: process.env.EMAIL_FROM || "",
		to: process.env.EMAIL_TO || "",
	},
};

// Set the hash length for page IDs (16-256 characters), default to 32
let HASH_LENGTH: number = defaults.hashLength;
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
	process.env.NODE_ENV === "test"
		? defaults.dataDirectory
		: process.env.NODE_ENV === "production"
			? "/etc/email-page/data"
			: defaults.dataDirectory;

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

// Root endpoint to display application info
app.get("/", (req: Request, res: Response) => {
	const html = `
<!doctype html>
<html>
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Email Page</title>
		<style>
			body {
				font-family: Arial, sans-serif;
				line-height: 1.6;
				margin: 0;
				padding: 20px;
				max-width: 800px;
				margin: 0 auto;
				text-align: center;
			}
			h1 {
				color: #333;
				border-bottom: 1px solid #eee;
				padding-bottom: 10px;
			}
			.domain {
				color: #666;
				font-size: 18px;
				margin-top: 20px;
			}
		</style>
	</head>
	<body>
		<h1>Email Page</h1>
		<div class="domain">Running on: ${config.domain}</div>
	</body>
</html>`;

	res.setHeader("Content-Type", "text/html");
	res.send(html);
});

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

		let htmlContent = message;
		if (!isHTML) {
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
		const pageUrl = `http://${config.domain}/${pageId}`;

		// Send email with link to the page
		sendEmail(config, pageUrl, title);

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

// 404 handler for any route that doesn't match
app.use((req: Request, res: Response) => {
	const html = `
<!doctype html>
<html>
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>404 - Page Not Found</title>
		<style>
			body {
				font-family: Arial, sans-serif;
				line-height: 1.6;
				margin: 0;
				padding: 20px;
				max-width: 800px;
				margin: 0 auto;
				text-align: center;
			}
			h1 {
				color: #333;
				border-bottom: 1px solid #eee;
				padding-bottom: 10px;
			}
			.message {
				color: #666;
				font-size: 18px;
				margin-top: 20px;
			}
			.home-link {
				margin-top: 30px;
			}
			a {
				color: #0066cc;
				text-decoration: none;
			}
			a:hover {
				text-decoration: underline;
			}
		</style>
	</head>
	<body>
		<h1>404 - Page Not Found</h1>
		<div class="message">No page found at this address</div>
		<div class="home-link">
			<a href="/">Return to Home</a>
		</div>
	</body>
</html>`;

	res.status(404);
	res.setHeader("Content-Type", "text/html");
	res.send(html);
});

// Start the server if this file is run directly
if (require.main === module) {
	app.listen(port, () => {
		console.log(`Email page server running on port ${port}`);
		console.log(`Data directory: ${dataDir}`);
		console.log(`Template file: ${templatePath}`);
		console.log(`Hash length for page IDs: ${HASH_LENGTH} characters`);
		console.log(`Ready to accept requests at http://${config.domain}:${port}/new`);
	});
}

// Export for testing
export { app, dataDir, generatePageId, sendEmail };
