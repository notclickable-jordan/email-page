export interface IConfig {
	smtp: {
		host: string;
		port: string;
		user?: string;
		pass?: string;
	};
	email: {
		from: string;
		to: string;
	};
	domain: string;
}

export const defaults = {
	port: 3000,
	hashLength: 32, // Default hash length for page IDs
	dataDirectory: "./data", // Default data directory
};
