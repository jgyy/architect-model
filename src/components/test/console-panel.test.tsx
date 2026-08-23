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
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    onExport?: () => void;
    onImport?: (file: File) => void;
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
        canUndo: false,
        canRedo: false,
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onExport: vi.fn(),
        onImport: vi.fn(),
        ...overrides,
    };
    const view = render(<ConsolePanel {...props} />);
    return { ...view, props };
}

// Finds the log row containing the given text by walking up from the text
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
                            "Blast Radius console - type help for a list of commands.",
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

    describe("undo/redo", () => {
        test("the undo button is disabled when canUndo is false", () => {
            renderPanel({ canUndo: false });
            expect(screen.getByTitle("Undo")).toBeDisabled();
        });

        test("clicking the undo button calls onUndo when enabled", async () => {
            const user = userEvent.setup();
            const onUndo = vi.fn();
            renderPanel({ canUndo: true, onUndo });

            await user.click(screen.getByTitle("Undo"));

            expect(onUndo).toHaveBeenCalledTimes(1);
        });

        test("the redo button is disabled when canRedo is false", () => {
            renderPanel({ canRedo: false });
            expect(screen.getByTitle("Redo")).toBeDisabled();
        });

        test("clicking the redo button calls onRedo when enabled", async () => {
            const user = userEvent.setup();
            const onRedo = vi.fn();
            renderPanel({ canRedo: true, onRedo });

            await user.click(screen.getByTitle("Redo"));

            expect(onRedo).toHaveBeenCalledTimes(1);
        });
    });

    describe("export/import", () => {
        test("clicking the export button calls onExport", async () => {
            const user = userEvent.setup();
            const onExport = vi.fn();
            renderPanel({ onExport });

            await user.click(screen.getByTitle("Export architecture"));

            expect(onExport).toHaveBeenCalledTimes(1);
        });

        test("choosing a file in the import input calls onImport with it", async () => {
            const user = userEvent.setup();
            const onImport = vi.fn();
            renderPanel({ onImport });
            const file = new File(['{"nodes":[],"edges":[]}'], "arch.json", {
                type: "application/json",
            });

            await user.upload(
                screen.getByLabelText("Import architecture file"),
                file,
            );

            expect(onImport).toHaveBeenCalledTimes(1);
            expect(onImport).toHaveBeenCalledWith(file);
        });

        test("clicking the import button opens the (hidden) file picker", async () => {
            const user = userEvent.setup();
            renderPanel();
            const fileInput = screen.getByLabelText(
                "Import architecture file",
            ) as HTMLInputElement;
            const clickSpy = vi.spyOn(fileInput, "click");

            await user.click(screen.getByTitle("Import architecture"));

            expect(clickSpy).toHaveBeenCalledTimes(1);
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

    describe("auto-scroll", () => {
        // jsdom does no layout, so scrollHeight/clientHeight are always 0
        function stubScrollGeometry(
            el: HTMLElement,
            geometry: { scrollHeight: number; clientHeight: number },
        ) {
            Object.defineProperty(el, "scrollHeight", {
                value: geometry.scrollHeight,
                configurable: true,
            });
            Object.defineProperty(el, "clientHeight", {
                value: geometry.clientHeight,
                configurable: true,
            });
        }

        function scrollContainer(container: HTMLElement): HTMLElement {
            const el = container.querySelector(".overflow-y-auto");
            if (!el) throw new Error("scroll container not found");
            return el as HTMLElement;
        }

        test("scrolls to the bottom when a new entry arrives while already at the bottom", () => {
            const { container, rerender } = renderPanel({
                log: [logEntry({ id: 1 })],
            });
            const el = scrollContainer(container);
            stubScrollGeometry(el, { scrollHeight: 500, clientHeight: 200 });
            el.scrollTop = 300; // exactly at the bottom (500 - 300 - 200 = 0)
            fireEvent.scroll(el);

            stubScrollGeometry(el, { scrollHeight: 600, clientHeight: 200 });
            rerender(
                <ConsolePanel
                    {...{
                        log: [logEntry({ id: 1 }), logEntry({ id: 2 })],
                        onClear: vi.fn(),
                        input: "",
                        onInputChange: vi.fn(),
                        onSubmit: vi.fn(),
                        architecture: emptyArchitecture(),
                        canUndo: false,
                        canRedo: false,
                        onUndo: vi.fn(),
                        onRedo: vi.fn(),
                        onExport: vi.fn(),
                        onImport: vi.fn(),
                    }}
                />,
            );

            expect(el.scrollTop).toBe(600);
        });

        test("does not yank the view back to the bottom when the user has scrolled up to read earlier output", () => {
            const { container, rerender } = renderPanel({
                log: [logEntry({ id: 1 })],
            });
            const el = scrollContainer(container);
            stubScrollGeometry(el, { scrollHeight: 500, clientHeight: 200 });
            el.scrollTop = 0; // scrolled all the way up, far from the bottom
            fireEvent.scroll(el);

            stubScrollGeometry(el, { scrollHeight: 600, clientHeight: 200 });
            rerender(
                <ConsolePanel
                    {...{
                        log: [logEntry({ id: 1 }), logEntry({ id: 2 })],
                        onClear: vi.fn(),
                        input: "",
                        onInputChange: vi.fn(),
                        onSubmit: vi.fn(),
                        architecture: emptyArchitecture(),
                        canUndo: false,
                        canRedo: false,
                        onUndo: vi.fn(),
                        onRedo: vi.fn(),
                        onExport: vi.fn(),
                        onImport: vi.fn(),
                    }}
                />,
            );

            expect(el.scrollTop).toBe(0);
        });
    });
});
