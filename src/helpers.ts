import crypto from "crypto";
import nodemailer from "nodemailer";
import { IConfig } from "./types";

// Helper to generate hash-based IDs for filenames
export function generatePageId(hashLength: number): string {
	// Create a string with current date and a random value to ensure uniqueness
	const now = new Date();
	const uniqueString = now.toISOString() + Math.random().toString();

	// Generate SHA-256 hash
	const hash = crypto.createHash("sha256").update(uniqueString).digest("hex");

	// Use configurable length of the hash (default 32 characters = 128 bits)
	// A length of 32 gives us 2^128 possible values, virtually eliminating any collision chance
	// While still keeping the filename reasonable and valid in Linux filesystems
	return hash.substring(0, hashLength);
}

// Helper function to apply template
export function applyTemplate(template: string, data: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
		return data[key] !== undefined ? data[key] : match;
	});
}

// Helper to send email
export async function sendEmail(config: IConfig, pageUrl: string, title: string): Promise<void> {
	if (!config.smtp.host || !config.email.from || !config.email.to) {
		console.log("SMTP configuration incomplete, skipping email send");
		return;
	}

	const transporter = nodemailer.createTransport({
		host: config.smtp.host,
		port: config.smtp.port ? parseInt(config.smtp.port, 10) : 25,
		secure: config.smtp.port === "465",
		auth:
			config.smtp.user && config.smtp.pass
				? {
						user: config.smtp.user,
						pass: config.smtp.pass,
					}
				: undefined,
	});

	const mailOptions = {
		from: config.email.from,
		to: config.email.to,
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
