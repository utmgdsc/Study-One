/*
Tests for lib/ api.ts - generateStudyPack

to run the test: 
1. install: npm install --save-dev ts-jest @types/jest
2. run: npm test

*/

import { generateStudyPack } from "@/lib/api"

const VALID_NOTES = "Photosynthesis converts sunlight into glucose using chlorophyll.";

const MOCK_RESPONSE = {
  summary: ["Plants use sunlight to produce food.", "Chlorophyll absorbs light energy."],
  quiz: [
    {
      question: "What pigment absorbs light in photosynthesis?",
      options: ["Melanin", "Chlorophyll", "Carotene", "Haemoglobin"],
      answer: "Chlorophyll",
    },
  ],
};

//  SETUP

beforeEach(( ) => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
});

function mockFetch(status: number, body: unknown, opts: {networkError?: boolean} = {}) {
    (global.fetch as jest.Mock).mockImplementation(() => {
        if (opts.networkError) return Promise.reject(new TypeError("Failed to fetch"));
        return Promise.resolve({
            ok: status >= 200 && status < 300, 
            status, 
            json: () => Promise.resolve(body),
            text: () => Promise.resolve(JSON.stringify(body)),
        });
    });
}


// REQUEST TEST

describe("generateStudyPack - request", () => {
    it("correct endpoint: POST /generate-study-pack", async () => {
        mockFetch(200, MOCK_RESPONSE);
        await generateStudyPack(VALID_NOTES);

        const [url, options] = (fetch as jest.Mock).mock.calls[0];
        expect(url).toBe("http://localhost:8000/generate-study-pack");
        expect(options.method).toBe("POST");
    });

    it("correct Content-Type", async () => {
        mockFetch(200, MOCK_RESPONSE);
        await generateStudyPack(VALID_NOTES);

        const options = (fetch as jest.Mock).mock.calls[0][1];
        expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("text correct sent", async () => {
        mockFetch(200, MOCK_RESPONSE);
        await generateStudyPack(VALID_NOTES);

        const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
        expect(body).toHaveProperty("text", VALID_NOTES);
    });
});

// RESPONSE TEST

describe("generateStudyPack - response", () => {
    it("correct summary array", async () => {
        mockFetch(200, MOCK_RESPONSE);
        const response = await generateStudyPack(VALID_NOTES);

        expect(response.summary).toEqual(MOCK_RESPONSE.summary);
    });

    it("correct quiz array", async () => {
        mockFetch(200, MOCK_RESPONSE);
        const response = await generateStudyPack(VALID_NOTES);

        expect(response.quiz).toHaveLength(1);
        expect(response.quiz[0]).toMatchObject({
            question: expect.any(String), 
            options: expect.arrayContaining([expect.any(String)]), 
            answer: expect.any(String),
        });
    });

    it("answer to quiz is one of the options for a quiz", async () => {
        mockFetch(200, MOCK_RESPONSE);
        const response = await generateStudyPack(VALID_NOTES);

        
        for (const q of response.quiz){
            expect(q.options).toContain(q.answer);
        }
    });
});

// ERROR TEST

describe("generateStudyPack - errors", () => {
    it("backend not reachable", async () => {
        mockFetch(0, null, {networkError: true});

        await expect(generateStudyPack(VALID_NOTES)).rejects.toThrow();
    });

    it("error thrown is instance of Error", async () => {
        mockFetch(0, null, {networkError: true});

        await expect(generateStudyPack(VALID_NOTES)).rejects.toBeInstanceOf(Error);
    });


    it("500 - Gemini unavailable", async () => {
        mockFetch(500, {
            detail: "Failed to generate study pack. Please try again.",
        });
        
        await expect(generateStudyPack(VALID_NOTES)).rejects.toThrow();
    });

    it("422 - text length error", async () => {
        mockFetch(422, {
            detail: [{ loc: ["body", "text"], msg: "text must not be less than 10 characters" }],
        });
        
        await expect(generateStudyPack("q")).rejects.toThrow();
    });

    it("500 - AI parse failure", async () => {
        mockFetch(500, {
            detail: "Failed to parse AI response as JSON. Please try again.",
        });
        
        await expect(generateStudyPack(VALID_NOTES)).rejects.toThrow();
    });
});