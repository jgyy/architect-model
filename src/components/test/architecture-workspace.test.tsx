// @vitest-environment jsdom
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi,
} from "vitest";

import { ArchitectureWorkspace } from "@/components/architecture-workspace";
import { loadPersistedState, type PersistedState } from "@/lib/persistence";
import { HELP_MESSAGE } from "@/lib/supported-commands";
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

const STORAGE_KEY = "architect-model:session";

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

function emptyFixture(): Architecture {
    return { nodes: [], edges: [] };
}

async function waitForHydration() {
    // ReactFlow's onInit and the workspace's localStorage-hydration effect
    await new Promise((resolve) => setTimeout(resolve, 10));
}

async function submitCommand(
    user: ReturnType<typeof userEvent.setup>,
    text: string,
) {
    const input = screen.getByRole("combobox", { name: "Command" });
    await user.type(input, `${text}{enter}`);
}

describe("ArchitectureWorkspace", () => {
    test("renders using initialArchitecture and shows the simulation panel on first mount with empty localStorage", async () => {
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);

        expect(await screen.findByText("Web Server")).toBeInTheDocument();
        expect(screen.getByText("Database")).toBeInTheDocument();
        expect(screen.getByText(/3 · Simulate/i)).toBeInTheDocument();
    });

    test("does not render the simulation panel when the architecture has no nodes", async () => {
        render(<ArchitectureWorkspace initialArchitecture={emptyFixture()} />);

        await waitFor(() => {
            expect(
                screen.getByRole("combobox", { name: "Command" }),
            ).toBeInTheDocument();
        });
        expect(screen.queryByText(/3 · Simulate/i)).not.toBeInTheDocument();
    });

    test('typing "help" logs the supported commands as a successful entry', async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "help");

        // testing-library's getByText normalizes (collapses whitespace in)
        const normalizedMessage = HELP_MESSAGE.replace(/\s+/g, " ").trim();
        expect(await screen.findByText(normalizedMessage)).toBeInTheDocument();

        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(persisted?.log.at(-1)).toMatchObject({
                input: "help",
                ok: true,
                message: HELP_MESSAGE,
            });
        });
    });

    test('typing "?" also logs the supported commands as a successful entry', async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "?");

        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(persisted?.log.at(-1)).toMatchObject({
                input: "?",
                ok: true,
                message: HELP_MESSAGE,
            });
        });
    });

    test('submitting "add node Cache" adds the node to the canvas and persists it to localStorage', async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "add node Cache");

        expect(await screen.findByText("Cache")).toBeInTheDocument();

        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(
                persisted?.architecture.nodes.some(
                    (node) => node.data.label === "Cache",
                ),
            ).toBe(true);
        });
    });

    test('submitting "connect Database to Cache" twice in a row rejects the second as a duplicate', async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "add node Cache");
        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(persisted?.log.at(-1)).toMatchObject({ ok: true });
        });

        await submitCommand(user, "connect Database to Cache");
        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(persisted?.log.at(-1)).toMatchObject({ ok: true });
        });

        await submitCommand(user, "connect Database to Cache");

        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(persisted?.log.at(-1)).toMatchObject({
                ok: false,
                message: 'An edge from "Database" to "Cache" already exists.',
            });
        });
    });

    test("clicking the clear button resets the console and canvas back to initialArchitecture", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "add node Cache");
        expect(await screen.findByText("Cache")).toBeInTheDocument();
        await waitFor(() => {
            expect(loadPersistedState(window.localStorage)).not.toBeNull();
        });

        await user.click(screen.getByTitle("Clear console"));

        await waitFor(() => {
            expect(screen.queryByText("Cache")).not.toBeInTheDocument();
        });
        expect(screen.getByText("Web Server")).toBeInTheDocument();
        expect(screen.getByText("Database")).toBeInTheDocument();

        // handleClearHistory removes the persisted session
        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(persisted?.log).toEqual([]);
            expect(
                persisted?.architecture.nodes.map((node) => node.data.label),
            ).toEqual(["Web Server", "Database"]);
        });
    });

    test("a storage event from another tab re-renders the workspace to reflect the new state", async () => {
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const otherTabState: PersistedState = {
            architecture: {
                nodes: [
                    {
                        id: "queue",
                        position: { x: 0, y: 0 },
                        data: { label: "Message Queue" },
                    },
                ],
                edges: [],
            },
            log: [
                {
                    id: 1,
                    input: "add node Message Queue",
                    ok: true,
                    message: 'Added node "Message Queue" as simulation step 1.',
                },
            ],
            stepIndex: 0,
            speedIndex: 1,
        };

        fireEvent(
            window,
            new StorageEvent("storage", {
                key: STORAGE_KEY,
                newValue: JSON.stringify(otherTabState),
            }),
        );

        expect(await screen.findByText("Message Queue")).toBeInTheDocument();
        expect(screen.queryByText("Web Server")).not.toBeInTheDocument();
        expect(screen.getByText("add node Message Queue")).toBeInTheDocument();
    });

    test("hydrating from an existing session does not perform a redundant localStorage write", async () => {
        const seeded: PersistedState = {
            architecture: fixture(),
            log: [
                {
                    id: 1,
                    input: "add node Cache",
                    ok: true,
                    message: 'Added node "Cache".',
                },
            ],
            stepIndex: 0,
            speedIndex: 1,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
        const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();
        // give the autosave effect a chance to run, if it's going to
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(
            setItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEY),
        ).toHaveLength(0);
        setItemSpy.mockRestore();
    });

    test("an invalid cross-tab storage update is overwritten with this tab's own known-good state instead of silently left corrupted", async () => {
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        // Missing `log` - fails schema validation, unlike a normal update
        fireEvent(
            window,
            new StorageEvent("storage", {
                key: STORAGE_KEY,
                newValue: JSON.stringify({
                    architecture: { nodes: [], edges: [] },
                }),
            }),
        );

        // This tab's own UI is unaffected...
        expect(screen.getByText("Web Server")).toBeInTheDocument();
        expect(screen.getByText("Database")).toBeInTheDocument();

        // later reload back down to initialArchitecture
        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(
                persisted?.architecture.nodes.map((node) => node.data.label),
            ).toEqual(["Web Server", "Database"]);
        });
    });

    test("dragging a simulation step onto another runs the equivalent 'move node' command and reorders the architecture", async () => {
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const dataTransfer = { setData: () => {}, getData: () => "" };
        const from = screen.getByText(/^1\./).closest("li");
        const to = screen.getByText(/^2\./).closest("li");
        if (!from || !to) throw new Error("row not found");
        fireEvent.dragStart(from, { dataTransfer });
        fireEvent.dragOver(to, { dataTransfer });
        fireEvent.drop(to, { dataTransfer });

        expect(
            screen.getByText("move node Web Server to step 2"),
        ).toBeInTheDocument();

        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(
                persisted?.architecture.nodes.map((node) => node.data.label),
            ).toEqual(["Database", "Web Server"]);
        });
    });

    test("moving a different node past the current step keeps the current node's identity, instead of silently reassigning 'current' to whichever node shifted into that slot", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        // Web Server (step 1) starts as the current step
        expect(screen.getByText(/^Step 1 \/ 2$/)).toBeInTheDocument();

        // Move Database (step 2, a different node) up to step 1
        await user.click(
            screen.getByRole("button", { name: "Move step 2 up" }),
        );

        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(
                persisted?.architecture.nodes.map((node) => node.data.label),
            ).toEqual(["Database", "Web Server"]);
        });

        // "current" should have followed Web Server to its new step 2
        expect(screen.getByText(/^Step 2 \/ 2$/)).toBeInTheDocument();
        expect(screen.getByText('Reaches "Web Server".')).toBeInTheDocument();
    });

    test('typing "undo" reverts the last command and logs what was undone', async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "add node Cache");
        expect(await screen.findByText("Cache")).toBeInTheDocument();

        await submitCommand(user, "undo");

        await waitFor(() => {
            expect(screen.queryByText("Cache")).not.toBeInTheDocument();
        });
        expect(screen.getByText('Undid "add node Cache".')).toBeInTheDocument();
        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(
                persisted?.architecture.nodes.map((node) => node.data.label),
            ).toEqual(["Web Server", "Database"]);
        });
    });

    test('typing "undo" with nothing to undo logs a failure instead of touching the architecture', async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "undo");

        expect(await screen.findByText("Nothing to undo.")).toBeInTheDocument();
        expect(screen.getByText("Web Server")).toBeInTheDocument();
        expect(screen.getByText("Database")).toBeInTheDocument();
    });

    test('typing "redo" re-applies an undone command and logs what was redone', async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "add node Cache");
        await submitCommand(user, "undo");
        await waitFor(() => {
            expect(screen.queryByText("Cache")).not.toBeInTheDocument();
        });

        await submitCommand(user, "redo");

        expect(await screen.findByText("Cache")).toBeInTheDocument();
        expect(screen.getByText('Redid "add node Cache".')).toBeInTheDocument();
    });

    test("the undo/redo toolbar buttons are disabled until there is something to undo/redo, and run the same commands as typing them", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        expect(screen.getByTitle("Undo")).toBeDisabled();
        expect(screen.getByTitle("Redo")).toBeDisabled();

        await submitCommand(user, "add node Cache");
        expect(await screen.findByText("Cache")).toBeInTheDocument();
        expect(screen.getByTitle("Undo")).toBeEnabled();

        await user.click(screen.getByTitle("Undo"));
        await waitFor(() => {
            expect(screen.queryByText("Cache")).not.toBeInTheDocument();
        });
        expect(screen.getByTitle("Undo")).toBeDisabled();
        expect(screen.getByTitle("Redo")).toBeEnabled();

        await user.click(screen.getByTitle("Redo"));
        expect(await screen.findByText("Cache")).toBeInTheDocument();
        expect(screen.getByTitle("Redo")).toBeDisabled();
    });

    test("a cross-tab storage sync clears this tab's local undo history", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "add node Cache");
        expect(await screen.findByText("Cache")).toBeInTheDocument();
        expect(screen.getByTitle("Undo")).toBeEnabled();

        const otherTabState: PersistedState = {
            architecture: {
                nodes: [
                    {
                        id: "queue",
                        position: { x: 0, y: 0 },
                        data: { label: "Message Queue" },
                    },
                ],
                edges: [],
            },
            log: [],
            stepIndex: 0,
            speedIndex: 1,
        };
        fireEvent(
            window,
            new StorageEvent("storage", {
                key: STORAGE_KEY,
                newValue: JSON.stringify(otherTabState),
            }),
        );

        expect(await screen.findByText("Message Queue")).toBeInTheDocument();
        expect(screen.getByTitle("Undo")).toBeDisabled();
    });

    test("clearing the console also clears the undo/redo history", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "add node Cache");
        expect(await screen.findByText("Cache")).toBeInTheDocument();
        expect(screen.getByTitle("Undo")).toBeEnabled();

        await user.click(screen.getByTitle("Clear console"));

        await waitFor(() => {
            expect(screen.getByTitle("Undo")).toBeDisabled();
        });
    });

    test('typing "export" downloads the architecture as JSON and logs a success message', async () => {
        const user = userEvent.setup();
        const clickSpy = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => {});
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "export");

        expect(
            await screen.findByText(
                'Exported 2 node(s) and 1 edge(s) to "architecture.json".',
            ),
        ).toBeInTheDocument();
        expect(clickSpy).toHaveBeenCalledTimes(1);
        clickSpy.mockRestore();
    });

    test("clicking the export toolbar button runs the same 'export' command as typing it", async () => {
        const user = userEvent.setup();
        const clickSpy = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => {});
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await user.click(screen.getByTitle("Export architecture"));

        expect(await screen.findByText("export")).toBeInTheDocument();
        expect(clickSpy).toHaveBeenCalledTimes(1);
        clickSpy.mockRestore();
    });

    test("choosing a valid architecture file replaces the architecture and is undoable", async () => {
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
            "replacement.json",
            { type: "application/json" },
        );

        await user.upload(
            screen.getByLabelText("Import architecture file"),
            file,
        );

        expect(await screen.findByText("Message Queue")).toBeInTheDocument();
        expect(screen.queryByText("Web Server")).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Imported 1 node(s) and 0 edge(s) from "replacement.json".',
            ),
        ).toBeInTheDocument();

        // recorded like any other architecture-mutating command
        expect(screen.getByTitle("Undo")).toBeEnabled();
        await user.click(screen.getByTitle("Undo"));
        expect(await screen.findByText("Web Server")).toBeInTheDocument();
    });

    test("choosing a malformed file logs the parse failure and leaves the architecture untouched", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const file = new File(["not json"], "bad.json", {
            type: "application/json",
        });

        await user.upload(
            screen.getByLabelText("Import architecture file"),
            file,
        );

        expect(
            await screen.findByText("That file isn't valid JSON."),
        ).toBeInTheDocument();
        expect(screen.getByText("Web Server")).toBeInTheDocument();
        expect(screen.getByTitle("Undo")).toBeDisabled();
    });

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

    test('typing "move node" directly (not just dragging/clicking the timeline) also keeps the current node\'s identity', async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        // Web Server (step 1) starts as the current step
        expect(screen.getByText(/^Step 1 \/ 2$/)).toBeInTheDocument();

        await submitCommand(user, "move node Database to step 1");

        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(
                persisted?.architecture.nodes.map((node) => node.data.label),
            ).toEqual(["Database", "Web Server"]);
        });

        // "current" should have followed Web Server to its new step 2,
        // exactly like the equivalent timeline-button interaction does.
        expect(screen.getByText(/^Step 2 \/ 2$/)).toBeInTheDocument();
        expect(screen.getByText('Reaches "Web Server".')).toBeInTheDocument();
    });

    test("removing a node ahead of the current step keeps the current node's identity", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        // Jump to Database (step 2) as the current step
        await user.click(screen.getByRole("button", { name: /^2\./ }));
        expect(screen.getByText(/^Step 2 \/ 2$/)).toBeInTheDocument();

        await submitCommand(user, "remove node Web Server");

        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(
                persisted?.architecture.nodes.map((node) => node.data.label),
            ).toEqual(["Database"]);
        });

        // Database is now the only (and first) step - "current" must stay
        // on it rather than silently landing on whatever shares its old index.
        expect(screen.getByText(/^Step 1 \/ 1$/)).toBeInTheDocument();
        expect(screen.getByText('Reaches "Database".')).toBeInTheDocument();
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

    test("a storage event that clears the key resets the workspace back to initialArchitecture", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        await submitCommand(user, "add node Cache");
        expect(await screen.findByText("Cache")).toBeInTheDocument();

        fireEvent(
            window,
            new StorageEvent("storage", {
                key: STORAGE_KEY,
                newValue: null,
            }),
        );

        await waitFor(() => {
            expect(screen.queryByText("Cache")).not.toBeInTheDocument();
        });
        expect(screen.getByText("Web Server")).toBeInTheDocument();
        expect(screen.getByText("Database")).toBeInTheDocument();
    });

    test("a cross-tab storage update closes an open merge picker instead of leaving it to be confirmed against a stale architecture", async () => {
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
        expect(
            await screen.findByRole("dialog", { name: /Merge nodes/ }),
        ).toBeInTheDocument();

        const otherTabState: PersistedState = {
            architecture: {
                nodes: [
                    {
                        id: "queue",
                        position: { x: 0, y: 0 },
                        data: { label: "Message Queue" },
                    },
                ],
                edges: [],
            },
            log: [],
            stepIndex: 0,
            speedIndex: 1,
        };
        fireEvent(
            window,
            new StorageEvent("storage", {
                key: STORAGE_KEY,
                newValue: JSON.stringify(otherTabState),
            }),
        );

        await waitFor(() => {
            expect(
                screen.queryByRole("dialog", { name: /Merge nodes/ }),
            ).not.toBeInTheDocument();
        });
        expect(
            screen.getByText(
                "Cancelled: the architecture changed in another tab while the merge picker was open.",
            ),
        ).toBeInTheDocument();
    });

    test("a localStorage write failure (e.g. quota exceeded, private browsing) is surfaced in the console log instead of silently discarding the change", async () => {
        const user = userEvent.setup();
        render(<ArchitectureWorkspace initialArchitecture={fixture()} />);
        await waitForHydration();

        const setItemSpy = vi
            .spyOn(Storage.prototype, "setItem")
            .mockImplementation(() => {
                throw new Error("QuotaExceededError");
            });

        await submitCommand(user, "add node Cache");

        expect(
            await screen.findByText(
                "Couldn't save to this browser's local storage (it may be full, or you're in private browsing) - your changes may not survive closing this tab.",
            ),
        ).toBeInTheDocument();

        setItemSpy.mockRestore();
    });
});
