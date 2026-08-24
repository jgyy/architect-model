// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
} from "vitest";

import { ArchitectureWorkspace } from "@/components/architecture-workspace";
import type { Architecture } from "@/types/architecture";

// Node 22+'s own global `localStorage` getter
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom
    ?.window;
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
);
// Installed unconditionally (not gated on reading window.localStorage first)
if (jsdomWindow) {
    Object.defineProperty(globalThis, "localStorage", {
        value: jsdomWindow.localStorage,
        configurable: true,
        writable: true,
    });
}

afterAll(() => {
    if (originalLocalStorageDescriptor) {
        Object.defineProperty(
            globalThis,
            "localStorage",
            originalLocalStorageDescriptor,
        );
    }
});

afterEach(cleanup);

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    window.localStorage.clear();
});

function fixture(): Architecture {
    return {
        nodes: [
            {
                id: "web",
                position: { x: 0, y: 0 },
                data: { label: "Web Server" },
            },
            {
                id: "db",
                position: { x: 200, y: 0 },
                data: { label: "Database" },
            },
        ],
        edges: [{ id: "web-db", source: "web", target: "db" }],
    };
}

async function waitForHydration() {
    // ReactFlow's onInit and the workspace's localStorage-hydration effect
    await new Promise((resolve) => setTimeout(resolve, 10));
}

describe("ArchitectureWorkspace", () => {
    test("choosing a valid architecture file merges it into the existing architecture and is undoable", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const file = new File(
            [
                JSON.stringify({
                    nodes: [
                        {
                            id: "queue",
                            position: { x: 0, y: 0 },
                            data: { label: "Message Queue" },
                        },
                    ],
                    edges: [],
                }),
            ],
            "extra.json",
            { type: "application/json" },
        );

        await user.upload(
            screen.getByLabelText("Merge architecture file"),
            file,
        );
        await user.click(
            await screen.findByRole("button", { name: /Merge \d+ node/ }),
        );

        expect(await screen.findByText("Message Queue")).toBeInTheDocument();
        expect(screen.getByText("Web Server")).toBeInTheDocument();
        expect(
            screen.getByText(
                'Merged 1 node(s) and 0 edge(s) from "extra.json" into the existing architecture.',
            ),
        ).toBeInTheDocument();

        expect(screen.getByTitle("Undo")).toBeEnabled();
        await user.click(screen.getByTitle("Undo"));
        expect(screen.queryByText("Message Queue")).not.toBeInTheDocument();
        expect(screen.getByText("Web Server")).toBeInTheDocument();
    });

    test("the merge picker lets you bring in only a subset of the file's nodes", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const file = new File(
            [
                JSON.stringify({
                    nodes: [
                        {
                            id: "queue",
                            position: { x: 0, y: 0 },
                            data: { label: "Message Queue" },
                        },
                        {
                            id: "cache",
                            position: { x: 0, y: 0 },
                            data: { label: "Cache" },
                        },
                    ],
                    edges: [],
                }),
            ],
            "extra.json",
            { type: "application/json" },
        );

        await user.upload(
            screen.getByLabelText("Merge architecture file"),
            file,
        );
        await user.click(
            await screen.findByRole("checkbox", { name: /^Cache/ }),
        );
        await user.click(
            screen.getByRole("button", { name: /Merge \d+ node/ }),
        );

        expect(screen.queryByText("Cache")).not.toBeInTheDocument();
        expect(await screen.findByText("Message Queue")).toBeInTheDocument();
        expect(
            screen.getByText(
                'Merged 1 of 2 node(s) and 0 edge(s) from "extra.json" into the existing architecture.',
            ),
        ).toBeInTheDocument();
    });

    test("the merge picker lets you connect two selected nodes that the file left unconnected", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const file = new File(
            [
                JSON.stringify({
                    nodes: [
                        {
                            id: "queue",
                            position: { x: 0, y: 0 },
                            data: { label: "Message Queue" },
                        },
                        {
                            id: "cache",
                            position: { x: 0, y: 0 },
                            data: { label: "Cache" },
                        },
                    ],
                    edges: [],
                }),
            ],
            "extra.json",
            { type: "application/json" },
        );

        await user.upload(
            screen.getByLabelText("Merge architecture file"),
            file,
        );
        await user.click(
            await screen.findByRole("button", { name: "Add connection" }),
        );
        await user.click(
            screen.getByRole("button", { name: /Merge \d+ node/ }),
        );

        expect(await screen.findByText("Message Queue")).toBeInTheDocument();
        expect(
            screen.getByText(
                'Merged 2 node(s) and 1 edge(s) from "extra.json" into the existing architecture.',
            ),
        ).toBeInTheDocument();
    });

    test("the merge picker's Insert at step control places the merged node ahead of the existing steps", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const file = new File(
            [
                JSON.stringify({
                    nodes: [
                        {
                            id: "queue",
                            position: { x: 0, y: 0 },
                            data: { label: "Message Queue" },
                        },
                    ],
                    edges: [],
                }),
            ],
            "extra.json",
            { type: "application/json" },
        );

        await user.upload(
            screen.getByLabelText("Merge architecture file"),
            file,
        );
        await user.selectOptions(
            await screen.findByRole("combobox", { name: "Insert at step" }),
            "Before step 1: Web Server",
        );
        await user.click(
            screen.getByRole("button", { name: /Merge \d+ node/ }),
        );

        expect(
            screen.getByText(
                'Merged 1 node(s) and 0 edge(s) from "extra.json" into the existing architecture at step 1.',
            ),
        ).toBeInTheDocument();
        // Message Queue is now step 1, but Web Server (the node the user was
        // actually viewing before the merge) stays "current" at its new
        // step 2 - inserting ahead of it must not silently reassign
        // "current" to whichever node landed in that slot.
        expect(screen.getByText("Step 2 / 3")).toBeInTheDocument();
        expect(screen.getByText('Reaches "Web Server".')).toBeInTheDocument();
    });

    test("cancelling the merge picker leaves the architecture untouched", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const file = new File(
            [
                JSON.stringify({
                    nodes: [
                        {
                            id: "queue",
                            position: { x: 0, y: 0 },
                            data: { label: "Message Queue" },
                        },
                    ],
                    edges: [],
                }),
            ],
            "extra.json",
            { type: "application/json" },
        );

        await user.upload(
            screen.getByLabelText("Merge architecture file"),
            file,
        );
        await user.click(await screen.findByRole("button", { name: "Cancel" }));

        expect(screen.queryByText("Message Queue")).not.toBeInTheDocument();
        expect(screen.getByText("Web Server")).toBeInTheDocument();
        expect(screen.getByTitle("Undo")).toBeDisabled();
    });

    test("merging a file whose node label collides renames it and notes the rename in the log", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const file = new File(
            [
                JSON.stringify({
                    nodes: [
                        {
                            id: "web",
                            position: { x: 0, y: 0 },
                            data: { label: "Web Server" },
                        },
                    ],
                    edges: [],
                }),
            ],
            "extra.json",
            { type: "application/json" },
        );

        await user.upload(
            screen.getByLabelText("Merge architecture file"),
            file,
        );
        await user.click(
            await screen.findByRole("button", { name: /Merge \d+ node/ }),
        );

        expect(await screen.findByText("Web Server (2)")).toBeInTheDocument();
        expect(
            screen.getByText(
                'Merged 1 node(s) and 0 edge(s) from "extra.json" into the existing architecture. Renamed to avoid duplicates: "Web Server" renamed to "Web Server (2)".',
            ),
        ).toBeInTheDocument();
    });

    test("picking a second merge file while the picker is still open replaces the dialog's stale selection, instead of merging the wrong subset", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const file1 = new File(
            [
                JSON.stringify({
                    nodes: [
                        {
                            id: "queue",
                            position: { x: 0, y: 0 },
                            data: { label: "Message Queue" },
                        },
                    ],
                    edges: [],
                }),
            ],
            "file1.json",
            { type: "application/json" },
        );
        const file2 = new File(
            [
                JSON.stringify({
                    nodes: [
                        {
                            id: "cache",
                            position: { x: 0, y: 0 },
                            data: { label: "Cache" },
                        },
                    ],
                    edges: [],
                }),
            ],
            "file2.json",
            { type: "application/json" },
        );

        const mergeInput = screen.getByLabelText("Merge architecture file");
        await user.upload(mergeInput, file1);
        expect(
            await screen.findByRole("checkbox", { name: /^Message Queue/ }),
        ).toBeInTheDocument();

        // Pick a second, different file before confirming the first
        await user.upload(mergeInput, file2);

        // The dialog now reflects file2, with its own (freshly reset,
        // fully-selected) state - not file1's stale checkboxes
        expect(
            screen.queryByRole("checkbox", { name: /^Message Queue/ }),
        ).not.toBeInTheDocument();
        expect(
            await screen.findByRole("checkbox", { name: /^Cache/ }),
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: /Merge \d+ node/ }),
        );

        expect(await screen.findByText("Cache")).toBeInTheDocument();
        expect(screen.queryByText("Message Queue")).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Merged 1 node(s) and 0 edge(s) from "file2.json" into the existing architecture.',
            ),
        ).toBeInTheDocument();
    });

    test("choosing a malformed file to merge logs the parse failure and leaves the architecture untouched", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const file = new File(["not json"], "bad.json", {
            type: "application/json",
        });

        await user.upload(
            screen.getByLabelText("Merge architecture file"),
            file,
        );

        expect(
            await screen.findByText("That file isn't valid JSON."),
        ).toBeInTheDocument();
        expect(screen.getByText("Web Server")).toBeInTheDocument();
        expect(screen.getByTitle("Undo")).toBeDisabled();
    });
});
