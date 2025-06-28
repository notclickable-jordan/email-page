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
const homeTemplatePath: string = path.join(templateDir, "home.html");
const notFoundTemplatePath: string = path.join(templateDir, "404.html");

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

	// Check if required template files exist and throw error if they don't
	const requiredTemplates = [
		{ path: templatePath, name: "default" },
		{ path: homeTemplatePath, name: "home" },
		{ path: notFoundTemplatePath, name: "404" },
	];

	for (const template of requiredTemplates) {
		if (!fs.existsSync(template.path)) {
			const errorMessage = `Template file not found at ${template.path}. Please create the template file before running the application.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
		console.log(`Using ${template.name} template: ${template.path}`);
	}
} catch (error) {
	console.error(`Template setup error: ${(error as Error).message}`);
	// Always throw for template issues as they are critical for functionality
	throw error;
}

// Load the HTML templates
let htmlTemplate: string;
let homeTemplate: string;
let notFoundTemplate: string;

try {
	htmlTemplate = fs.readFileSync(templatePath, "utf8");
	homeTemplate = fs.readFileSync(homeTemplatePath, "utf8");
	notFoundTemplate = fs.readFileSync(notFoundTemplatePath, "utf8");
	console.log("HTML templates loaded successfully");
} catch (error) {
	console.error(`Failed to load HTML templates: ${(error as Error).message}`);
	// Don't use fallback, consider template loading as critical
	throw error;
}

// Middleware
app.use(bodyParser.json());

// Serve static files from the public directory
const publicDir = path.join(__dirname, "..", "public");
// Ensure public directory exists
try {
	if (!fs.existsSync(publicDir)) {
		fs.mkdirSync(publicDir, { recursive: true });
		console.log(`Public directory created at: ${publicDir}`);
	}
	console.log(`Public directory confirmed at: ${publicDir}`);
} catch (error) {
	console.error(`Failed to create public directory at ${publicDir}:`, (error as Error).message);
}
app.use(express.static(publicDir));

// Root endpoint to display application info
app.get("/", (req: Request, res: Response) => {
	const content = applyTemplate(homeTemplate, {
		domain: config.domain,
	});

	res.setHeader("Content-Type", "text/html");
	res.send(content);
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
		console.log(`Page URL: http://${config.domain}/${pageId}`);

		// Generate page URL
		const pageUrl = `http://${config.domain}/${pageId}`;

		// Send email with link to the page
		sendEmail(config, pageUrl, title);

		// Return success with 204 No Content
		res.status(204).end();
	} catch (error) {
		console.error("Error creating page:", error);
		res.status(500).json({ error: "Failed to create page" });
		console.log(`----------`);
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
app.use((_: Request, res: Response) => {
	res.status(404);
	res.setHeader("Content-Type", "text/html");
	res.send(notFoundTemplate);
});

// Start the server if this file is run directly
if (require.main === module) {
	app.listen(port, () => {
		console.log(`Email page server running on port ${port}`);
		console.log(`Data directory: ${dataDir}`);
		console.log(`Template file: ${templatePath}`);
		console.log(`Hash length for page IDs: ${HASH_LENGTH} characters`);
		console.log(`Ready to accept requests at http://${config.domain}/new`);
		console.log(`----------`);
	});
}

// Export for testing
export { app, dataDir, generatePageId, sendEmail };
