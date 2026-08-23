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
if (jsdomWindow && !window.localStorage) {
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
        expect(screen.getByText(/^Simulation$/i)).toBeInTheDocument();
    });

    test("does not render the simulation panel when the architecture has no nodes", async () => {
        render(<ArchitectureWorkspace initialArchitecture={emptyFixture()} />);

        await waitFor(() => {
            expect(
                screen.getByRole("combobox", { name: "Command" }),
            ).toBeInTheDocument();
        });
        expect(screen.queryByText(/^Simulation$/i)).not.toBeInTheDocument();
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

        // ...and the corrupted entry no longer sits in storage to poison a
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

        // Move Database (step 2, a different node) up to step 1 - this
        // shifts Web Server down to step 2 without the user ever selecting
        // Database
        await user.click(
            screen.getByRole("button", { name: "Move step 2 up" }),
        );

        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(
                persisted?.architecture.nodes.map((node) => node.data.label),
            ).toEqual(["Database", "Web Server"]);
        });

        // "current" should have followed Web Server to its new step 2, not
        // silently become Database just because Database is now at index 0
        expect(screen.getByText(/^Step 2 \/ 2$/)).toBeInTheDocument();
        expect(screen.getByText('Reaches "Web Server".')).toBeInTheDocument();
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
});
