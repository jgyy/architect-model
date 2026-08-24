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
} from "vitest";

import { ArchitectureWorkspace } from "@/components/architecture-workspace";
import { loadPersistedState } from "@/lib/persistence";
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
});
