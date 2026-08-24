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
