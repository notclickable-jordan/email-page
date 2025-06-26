import crypto from "crypto";

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
