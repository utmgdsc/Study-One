/**
 * Test to check Home in page.tsx
 * 
 * 
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import * as api from "@/lib/api";

// mock generateStudyPack
jest.mock("@/lib/api");
const mockGenerateStudyPack = api.generateStudyPack as jest.MockedFunction<
    typeof api.generateStudyPack
>;

beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
});

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



// check that the page does not crash during request failures
describe("Home page - no page crashes", () => {
    it("survive backend down", async () => {
        mockGenerateStudyPack.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        render(<Home />);

        await userEvent.type(screen.getByRole("textbox"), VALID_NOTES);
        fireEvent.click(screen.getByRole("button", {name: /generate study pack/i}));

        // make sure the screen is still alive
        await waitFor(() => {
            expect(screen.getByRole("textbox")).toBeInTheDocument();
            expect(screen.getByRole("alert")).toBeInTheDocument();
        });
    });

    it("500 server error - Gemini unavailable", async () => {
        mockGenerateStudyPack.mockRejectedValueOnce(new Error("Failed to generate study pack. Please try again."));
        render(<Home />);

        await userEvent.type(screen.getByRole("textbox"), VALID_NOTES);
        fireEvent.click(screen.getByRole("button", {name: /generate study pack/i}));

        // make sure the screen is still alive
        await waitFor(() => {
            expect(screen.getByRole("textbox")).toBeInTheDocument();
            expect(screen.getByRole("alert")).toBeInTheDocument();
        });
    });

    it("short text length error", async () => {
        mockGenerateStudyPack.mockRejectedValueOnce(new TypeError("text must not be less than 10 characters"));
        render(<Home />);

        await userEvent.type(screen.getByRole("textbox"), "q");
        fireEvent.click(screen.getByRole("button", {name: /generate study pack/i}));

        // make sure the screen is still alive and see error message
        await waitFor(() => {
            expect(screen.getByRole("textbox")).toBeInTheDocument();
            expect(screen.getByRole("alert")).toBeInTheDocument();
        });
    });

    it("long text length error", async () => {
        mockGenerateStudyPack.mockRejectedValueOnce(new TypeError("text must not be more than 10000 characters"));
        render(<Home />);

        fireEvent.change(screen.getByRole("textbox"), {
            target: {value: "q".repeat}
        });
        fireEvent.click(screen.getByRole("button", {name: /generate study pack/i}));

        // make sure the screen is still alive and see error message
        await waitFor(() => {
            expect(screen.getByRole("textbox")).toBeInTheDocument();
            expect(screen.getByRole("alert")).toBeInTheDocument();
        });
    });

    it("submit again after failure without crashing", async () => {
        mockGenerateStudyPack
            .mockRejectedValueOnce(new TypeError("Failed to fetch"))
            .mockResolvedValueOnce(MOCK_RESPONSE);
        render(<Home />);

        await userEvent.type(screen.getByRole("textbox"), VALID_NOTES);
        // first attempt - error
        fireEvent.click(screen.getByRole("button", {name: /generate study pack/i}));
        // make sure the screen is still alive and see error message
        await waitFor(() => {
            expect(screen.getByRole("textbox")).toBeInTheDocument();
            expect(screen.getByRole("alert")).toBeInTheDocument();
        });

        // second attempt - generate study pack
        fireEvent.click(screen.getByRole("button", {name: /generate study pack/i}));
        // make sure the screen is still alive and see error message
        await waitFor(() => {
            expect(screen.getByRole("textbox")).toBeInTheDocument();
            expect(screen.queryByRole("alert")).not.toBeInTheDocument();
            // expect(screen.getByText("Plants use sunlight to produce food.")).toBeInTheDocument();
        });
    });
});

