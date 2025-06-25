const request = require("supertest");
const fs = require("fs");
const path = require("path");
const mockFs = require("mock-fs");
const { app, dataDir, generateTimestamp } = require("../index");

// Mock the nodemailer
jest.mock("nodemailer", () => ({
	createTransport: jest.fn().mockReturnValue({
		sendMail: jest.fn().mockImplementation(mailOptions => Promise.resolve({ messageId: "test-message-id" })),
	}),
}));

describe("Email Page API", () => {
	let mockDataDir;
	let consoleSpy;

	beforeEach(() => {
		// Mock the file system
		mockDataDir = "/etc/email-page/data";
		mockFs({
			[mockDataDir]: {},
		});

		// Spy on console logs
		consoleSpy = {
			log: jest.spyOn(console, "log").mockImplementation(),
			error: jest.spyOn(console, "error").mockImplementation(),
		};

		// Clear all environment variables used by the app
		delete process.env.SMTP_HOST;
		delete process.env.SMTP_PORT;
		delete process.env.SMTP_USER;
		delete process.env.SMTP_PASS;
		delete process.env.DOMAIN_NAME;
		delete process.env.EMAIL_FROM;
		delete process.env.EMAIL_TO;
	});

	afterEach(() => {
		// Restore the file system
		mockFs.restore();

		// Restore console spies
		consoleSpy.log.mockRestore();
		consoleSpy.error.mockRestore();

		// Clear all mocks
		jest.clearAllMocks();
	});

	describe("POST /new", () => {
		it("should create a new HTML page with text content and return 204", async () => {
			// Set up test data
			const testData = {
				title: "Test Title",
				message: "Test message with\nmultiple lines",
			};

			// Mock the timestamp generator to return a predictable value
			const originalGenerateTimestamp = generateTimestamp;
			global.generateTimestamp = jest.fn().mockReturnValue("2025-06-25-123456789");

			// Make the request
			const response = await request(app).post("/new").send(testData).expect(204);

			// Check that the file was created
			const filePath = path.join(mockDataDir, "page-2025-06-25-123456789.html");
			expect(fs.existsSync(filePath)).toBe(true);

			// Read the file and check its content
			const fileContent = fs.readFileSync(filePath, "utf8");
			expect(fileContent).toContain(`<title>${testData.title}</title>`);
			expect(fileContent).toContain(`<h1>${testData.title}</h1>`);
			expect(fileContent).toContain(testData.message.replace(/\n/g, "<br/>"));

			// Restore the original function
			global.generateTimestamp = originalGenerateTimestamp;
		});

		it("should create a new page with HTML content and return 204", async () => {
			// Set up HTML test data
			const htmlData = {
				title: "HTML Test",
				message: "<html><head><title>Custom HTML</title></head><body><h1>Custom HTML Page</h1></body></html>",
			};

			// Mock the timestamp generator
			const originalGenerateTimestamp = generateTimestamp;
			global.generateTimestamp = jest.fn().mockReturnValue("2025-06-25-987654321");

			// Make the request
			const response = await request(app).post("/new").send(htmlData).expect(204);

			// Check that the file was created
			const filePath = path.join(mockDataDir, "page-2025-06-25-987654321.html");
			expect(fs.existsSync(filePath)).toBe(true);

			// Read the file and check its content - should be exactly the HTML provided
			const fileContent = fs.readFileSync(filePath, "utf8");
			expect(fileContent).toBe(htmlData.message);

			// Restore the original function
			global.generateTimestamp = originalGenerateTimestamp;
		});

		it("should return 400 if title or message is missing", async () => {
			// Test missing title
			await request(app)
				.post("/new")
				.send({ message: "Test without title" })
				.expect(400)
				.expect(res => {
					expect(res.body.error).toBe("Title and message are required");
				});

			// Test missing message
			await request(app)
				.post("/new")
				.send({ title: "Test without message" })
				.expect(400)
				.expect(res => {
					expect(res.body.error).toBe("Title and message are required");
				});
		});
	});

	describe("GET /:pageId", () => {
		it("should serve an existing HTML page", async () => {
			// Create a test file first
			const pageId = "2025-06-25-123456789";
			const filePath = path.join(mockDataDir, `page-${pageId}.html`);
			const testContent = "<html><body><h1>Test Page</h1></body></html>";
			fs.writeFileSync(filePath, testContent);

			// Request the page
			const response = await request(app).get(`/${pageId}`).expect(200).expect("Content-Type", /html/);

			// Check the response content
			expect(response.text).toBe(testContent);
		});

		it("should return 404 if requested page does not exist", async () => {
			await request(app)
				.get("/non-existent-page")
				.expect(404)
				.expect(res => {
					expect(res.text).toBe("Page not found");
				});
		});
	});

	// Test the timestamp generation function
	describe("generateTimestamp", () => {
		it("should generate a timestamp in the correct format", () => {
			// Mock the Date object
			const originalDate = global.Date;
			const mockDate = new Date("2025-06-25T12:34:56.789Z");
			global.Date = jest.fn(() => mockDate);

			const timestamp = generateTimestamp();

			// Reset Date
			global.Date = originalDate;

			// Expect the timestamp to be in the correct format
			expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}-\d{9}$/);
			expect(timestamp).toBe("2025-06-25-123456789");
		});
	});
});
