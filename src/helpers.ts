import crypto from "crypto";
import nodemailer from "nodemailer";
import puppeteer from "puppeteer";
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
	htmlFilePath: string,
	outputDir: string,
	pageId: string,
	domain: string,
	title: string
): Promise<string | null> {
	
}

// Helper to generate description from message content
export function generateDescription(message: string, isHTML: boolean): string {
	if (isHTML) {
		return "";
	}
	
	// Remove any markdown formatting for a cleaner description
	let plainText = message
		.replace(/#+\s/g, '') // Remove markdown headers
		.replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
		.replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
		.replace(/`(.*?)`/g, '$1') // Remove code formatting
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to just text
		.replace(/\n+/g, ' ') // Replace newlines with spaces
		.trim();
	
	// Truncate to 100 characters
	if (plainText.length > 100) {
		return plainText.substring(0, 97) + '...';
	}
	
	return plainText;
}
