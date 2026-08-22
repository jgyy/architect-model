// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ConsolePanel } from "@/components/console-panel";
import type { LogEntry } from "@/lib/persistence";
import type { Architecture } from "@/types/architecture";

afterEach(cleanup);

type PanelOverrides = {
    log?: LogEntry[];
    onClear?: () => void;
    input?: string;
    onInputChange?: (value: string) => void;
    onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
    architecture?: Architecture;
};

function emptyArchitecture(): Architecture {
    return { nodes: [], edges: [] };
}

function logEntry(overrides: Partial<LogEntry> = {}): LogEntry {
    return {
        id: 1,
        input: "add node Cache",
        ok: true,
        message: "Added node Cache.",
        ...overrides,
    };
}

function renderPanel(overrides: PanelOverrides = {}) {
    const props = {
        log: [] as LogEntry[],
        onClear: vi.fn(),
        input: "",
        onInputChange: vi.fn(),
        onSubmit: vi.fn(),
        architecture: emptyArchitecture(),
        ...overrides,
    };
    const view = render(<ConsolePanel {...props} />);
    return { ...view, props };
}

// Finds the log row containing the given text by walking up from the text
// node's element: text -> "> input"/message wrapper -> icon + text row.
function logRow(text: string): HTMLElement {
    const cell = screen.getByText(text);
    const row = cell.parentElement?.parentElement;
    if (!row) throw new Error(`could not find log row for "${text}"`);
    return row;
}

describe("ConsolePanel", () => {
    describe("empty log", () => {
        test("shows the placeholder message inviting the user to type help", () => {
            renderPanel({ log: [] });
            expect(
                screen.getByText(
                    (_, element) =>
                        element?.tagName.toLowerCase() === "p" &&
                        element.textContent ===
                            "Blast Radius console — type help for a list of commands.",
                ),
            ).toBeInTheDocument();
        });
    });

    describe("log entries", () => {
        test("renders each entry's input and message text", () => {
            const log = [
                logEntry({
                    id: 1,
                    input: "add node Cache",
                    message: "Added node Cache.",
                }),
                logEntry({
                    id: 2,
                    input: "bogus command",
                    ok: false,
                    message: "Unknown command.",
                }),
            ];
            renderPanel({ log });
            expect(screen.getByText("add node Cache")).toBeInTheDocument();
            expect(screen.getByText("Added node Cache.")).toBeInTheDocument();
            expect(screen.getByText("bogus command")).toBeInTheDocument();
            expect(screen.getByText("Unknown command.")).toBeInTheDocument();
        });

        test("shows a success icon for an ok entry and a failure icon for a failed entry", () => {
            const log = [
                logEntry({ id: 1, input: "add node Cache", ok: true }),
                logEntry({
                    id: 2,
                    input: "bogus command",
                    ok: false,
                    message: "Unknown command.",
                }),
            ];
            renderPanel({ log });

            const okRow = logRow("add node Cache");
            const failRow = logRow("bogus command");

            expect(okRow.querySelector("svg")).toHaveClass("text-success");
            expect(okRow.querySelector("svg")).not.toHaveClass("text-danger");
            expect(failRow.querySelector("svg")).toHaveClass("text-danger");
            expect(failRow.querySelector("svg")).not.toHaveClass(
                "text-success",
            );
        });
    });

    describe("clearing the console", () => {
        test("clicking the clear button calls onClear", async () => {
            const user = userEvent.setup();
            const onClear = vi.fn();
            renderPanel({ onClear });

            await user.click(screen.getByTitle("Clear console"));

            expect(onClear).toHaveBeenCalledTimes(1);
        });
    });

    describe("command input integration", () => {
        test("reflects the input prop as the command input's value", () => {
            renderPanel({ input: "help" });
            expect(screen.getByRole("combobox")).toHaveValue("help");
        });

        test("forwards keystrokes in the command input to onInputChange", async () => {
            const user = userEvent.setup();
            const onInputChange = vi.fn();
            renderPanel({ onInputChange });

            await user.type(screen.getByRole("combobox"), "x");

            expect(onInputChange).toHaveBeenCalledWith("x");
        });

        test("forwards form submission to onSubmit", () => {
            const onSubmit = vi.fn((event: React.FormEvent) =>
                event.preventDefault(),
            );
            const { container } = renderPanel({ input: "help", onSubmit });

            const form = container.querySelector("form");
            expect(form).not.toBeNull();
            fireEvent.submit(form as HTMLFormElement);

            expect(onSubmit).toHaveBeenCalledTimes(1);
        });

        test("forwards the architecture prop through to the command input's node suggestions", () => {
            const architecture: Architecture = {
                nodes: [
                    {
                        id: "n1",
                        position: { x: 0, y: 0 },
                        data: { label: "Cache" },
                    },
                ],
                edges: [],
            };
            renderPanel({ architecture, input: "remove node Ca" });

            expect(
                screen.getByRole("option", { name: "Cache" }),
            ).toBeInTheDocument();
        });
    });
});
