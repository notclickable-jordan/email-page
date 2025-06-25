const nodemailer = require("nodemailer");
const { sendEmail } = require("../index");

// Mock nodemailer
jest.mock("nodemailer");

describe("Email Functionality", () => {
	let mockTransporter;
	let consoleSpy;

	beforeEach(() => {
		// Set up mock environment variables
		process.env.SMTP_HOST = "test.smtp.com";
		process.env.SMTP_PORT = "587";
		process.env.SMTP_USER = "test-user";
		process.env.SMTP_PASS = "test-password";
		process.env.EMAIL_FROM = "from@example.com";
		process.env.EMAIL_TO = "to@example.com";
		process.env.DOMAIN_NAME = "test.example.com";

		// Set up mock transporter
		mockTransporter = {
			sendMail: jest.fn().mockResolvedValue({ messageId: "test-message-id" }),
		};

		nodemailer.createTransport.mockReturnValue(mockTransporter);

		// Spy on console methods
		consoleSpy = {
			log: jest.spyOn(console, "log").mockImplementation(),
			error: jest.spyOn(console, "error").mockImplementation(),
		};
	});

	afterEach(() => {
		// Clean up
		jest.clearAllMocks();
		consoleSpy.log.mockRestore();
		consoleSpy.error.mockRestore();

		// Clear environment variables
		delete process.env.SMTP_HOST;
		delete process.env.SMTP_PORT;
		delete process.env.SMTP_USER;
		delete process.env.SMTP_PASS;
		delete process.env.EMAIL_FROM;
		delete process.env.EMAIL_TO;
		delete process.env.DOMAIN_NAME;
	});

	it("should send an email when all SMTP configuration is present", async () => {
		const pageUrl = "http://test.example.com/test-page-id";
		const title = "Test Page Title";

		await sendEmail(pageUrl, title);

		// Check transporter creation with correct config
		expect(nodemailer.createTransport).toHaveBeenCalledWith({
			host: "test.smtp.com",
			port: "587",
			secure: false,
			auth: {
				user: "test-user",
				pass: "test-password",
			},
		});

		// Check email sending with correct options
		expect(mockTransporter.sendMail).toHaveBeenCalledWith({
			from: "from@example.com",
			to: "to@example.com",
			subject: `New page created: ${title}`,
			text: expect.stringContaining(pageUrl),
			html: expect.stringContaining(pageUrl),
		});

		// Check that success was logged
		expect(consoleSpy.log).toHaveBeenCalledWith("Email sent:", "test-message-id");
	});

	it("should skip sending email when SMTP configuration is incomplete", async () => {
		// Remove required SMTP settings
		delete process.env.SMTP_HOST;

		await sendEmail("http://example.com/page", "Test Page");

		// Email should not be sent
		expect(nodemailer.createTransport).not.toHaveBeenCalled();
		expect(mockTransporter.sendMail).not.toHaveBeenCalled();

		// Log message should indicate skipping
		expect(consoleSpy.log).toHaveBeenCalledWith("SMTP configuration incomplete, skipping email send");
	});

	it("should handle errors in email sending", async () => {
		// Set up the transporter to reject
		const errorMessage = "Failed to send email";
		mockTransporter.sendMail.mockRejectedValue(new Error(errorMessage));

		await sendEmail("http://example.com/page", "Test Page");

		// Transporter should be created and sendMail called
		expect(nodemailer.createTransport).toHaveBeenCalled();
		expect(mockTransporter.sendMail).toHaveBeenCalled();

		// Error should be logged
		expect(consoleSpy.error).toHaveBeenCalledWith(
			"Error sending email:",
			expect.objectContaining({ message: errorMessage })
		);
	});

	it("should create correct transport with secure=true when port is 465", async () => {
		// Set secure port
		process.env.SMTP_PORT = "465";

		await sendEmail("http://example.com/page", "Test Page");

		// Check transporter creation with secure=true
		expect(nodemailer.createTransport).toHaveBeenCalledWith({
			host: "test.smtp.com",
			port: "465",
			secure: true,
			auth: {
				user: "test-user",
				pass: "test-password",
			},
		});
	});

	it("should create transport without auth when credentials are missing", async () => {
		// Remove auth credentials
		delete process.env.SMTP_USER;
		delete process.env.SMTP_PASS;

		await sendEmail("http://example.com/page", "Test Page");

		// Check transporter creation without auth
		expect(nodemailer.createTransport).toHaveBeenCalledWith({
			host: "test.smtp.com",
			port: "587",
			secure: false,
			auth: undefined,
		});
	});
});
