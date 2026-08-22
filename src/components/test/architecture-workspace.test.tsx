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
import { loadPersistedState, type PersistedState } from "@/lib/persistence";
import { SUPPORTED_COMMANDS } from "@/lib/supported-commands";
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

        const expectedMessage = SUPPORTED_COMMANDS.join("\n");
        // testing-library's getByText normalizes (collapses whitespace in)
        const normalizedMessage = expectedMessage.replace(/\s+/g, " ").trim();
        expect(await screen.findByText(normalizedMessage)).toBeInTheDocument();

        await waitFor(() => {
            const persisted = loadPersistedState(window.localStorage);
            expect(persisted?.log.at(-1)).toMatchObject({
                input: "help",
                ok: true,
                message: expectedMessage,
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
                message: SUPPORTED_COMMANDS.join("\n"),
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
