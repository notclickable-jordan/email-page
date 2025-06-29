import crypto from "crypto";
import nodemailer from "nodemailer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
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
		subject: title,
		text: `${title}\n\nView at: ${pageUrl}`,
		html: `<p><strong>${title}</strong>.</p><p>View at: <a href="${pageUrl}">${pageUrl}</a></p>`,
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		console.log("Email sent:", info.messageId);
	} catch (error) {
		console.error("Error sending email:", error);
	}
}

// Helper to generate open graph image
export async function generateOpenGraphImage(
	outputDir: string,
	pageId: string,
	title: string
): Promise<string | null> {
	try {
		const templatePath = path.join(process.cwd(), "public", "open-graph-template.png");
		const outputPath = path.join(outputDir, `page-${pageId}.png`);
		
		// Check if template exists
		if (!fs.existsSync(templatePath)) {
			console.error("Open graph template not found:", templatePath);
			return null;
		}
		
		// Text configuration
		const fontSize = 60;
		const fontFamily = "sans-serif";
		const textColor = "#000000";
		const startX = 330;
		const startY = 20;
		const maxWidth = 1280 - startX - 20; // 20px margin from right
		const maxHeight = 720 - 20; // 20px margin from bottom
		const lineHeight = fontSize * 1.2; // Standard line height multiplier
		
		// Break text into lines that fit within the specified width
		const words = title.split(" ");
		const lines: string[] = [];
		let currentLine = "";
		
		// Calculate approximate character width (rough estimate for Arial)
		const charWidth = fontSize * 0.6;
		const maxCharsPerLine = Math.floor(maxWidth / charWidth);
		
		for (const word of words) {
			const testLine = currentLine + (currentLine ? " " : "") + word;
			if (testLine.length <= maxCharsPerLine) {
				currentLine = testLine;
			} else {
				if (currentLine) {
					lines.push(currentLine);
					currentLine = word;
				} else {
					// Single word is too long, break it
					lines.push(word.substring(0, maxCharsPerLine - 3) + "...");
					currentLine = "";
				}
			}
		}
		if (currentLine) {
			lines.push(currentLine);
		}
		
		// Limit lines to fit within height constraints
		const maxLines = Math.floor((maxHeight - startY) / lineHeight);
		const finalLines = lines.slice(0, maxLines);
		
		// If we had to cut lines, add ellipsis to the last line
		if (lines.length > maxLines && finalLines.length > 0) {
			const lastLine = finalLines[finalLines.length - 1];
			finalLines[finalLines.length - 1] = lastLine.length > 50 
				? lastLine.substring(0, 47) + "..."
				: lastLine + "...";
		}
		
		// Create SVG text overlay
		const textElements = finalLines.map((line, index) => {
			const y = startY + (index * lineHeight) + fontSize;
			return `<text x="${startX}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}" fill="${textColor}">${line}</text>`;
		}).join("");
		
		const svgOverlay = `
			<svg width="1280" height="720">
				${textElements}
			</svg>
		`;
		
		// Load template image and composite with text
		await sharp(templatePath)
			.composite([{
				input: Buffer.from(svgOverlay),
				top: 0,
				left: 0
			}])
			.png()
			.toFile(outputPath);
		
		console.log(`Open graph image generated: ${outputPath}`);
		return outputPath;
		
	} catch (error) {
		console.error("Error generating open graph image:", error);
		return null;
	}
}

// Helper to format current date and time
export function formatCurrentDateTime(): string {
	const now = new Date();
	
	// Format date as "January 2, 2003"
	const dateOptions: Intl.DateTimeFormatOptions = {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	};
	const formattedDate = now.toLocaleDateString('en-US', dateOptions);
	
	// Format time as "3:45 PM"
	const timeOptions: Intl.DateTimeFormatOptions = {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	};
	const formattedTime = now.toLocaleTimeString('en-US', timeOptions);
	
	return `${formattedDate} - ${formattedTime}`;
}
