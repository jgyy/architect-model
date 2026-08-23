// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { MergePickerDialog } from "@/components/merge-picker-dialog";
import type { Architecture } from "@/types/architecture";

afterEach(cleanup);

const incoming: Architecture = {
    nodes: [
        {
            id: "queue",
            position: { x: 0, y: 0 },
            data: { label: "Message Queue" },
        },
        { id: "cache", position: { x: 0, y: 0 }, data: { label: "Cache" } },
    ],
    edges: [{ id: "edge-queue-cache", source: "queue", target: "cache" }],
};

const disjointThree: Architecture = {
    nodes: [
        { id: "a", position: { x: 0, y: 0 }, data: { label: "Alpha" } },
        { id: "b", position: { x: 0, y: 0 }, data: { label: "Beta" } },
        { id: "c", position: { x: 0, y: 0 }, data: { label: "Gamma" } },
    ],
    edges: [],
};

const emptyArchitecture: Architecture = { nodes: [], edges: [] };

function renderDialog(
    overrides: {
        onConfirm?: (
            ids: Set<string>,
            excludedEdgeIds: Set<string>,
            addedEdges: { source: string; target: string }[],
        ) => void;
        onCancel?: () => void;
        existingFoldedLabels?: ReadonlySet<string>;
        architecture?: Architecture;
        current?: Architecture;
    } = {},
) {
    const onConfirm = overrides.onConfirm ?? vi.fn();
    const onCancel = overrides.onCancel ?? vi.fn();
    render(
        <MergePickerDialog
            fileName="extra.json"
            incoming={overrides.architecture ?? incoming}
            current={overrides.current ?? emptyArchitecture}
            existingFoldedLabels={overrides.existingFoldedLabels ?? new Set()}
            onConfirm={onConfirm}
            onCancel={onCancel}
        />,
    );
    return { onConfirm, onCancel };
}

describe("MergePickerDialog", () => {
    test("renders a checked checkbox for every incoming node by default", () => {
        renderDialog();

        const queueBox = screen.getByRole("checkbox", {
            name: "Message Queue queue",
        });
        const cacheBox = screen.getByRole("checkbox", { name: /^Cache/ });
        expect(queueBox).toBeChecked();
        expect(cacheBox).toBeChecked();
    });

    test("shows a live count of selected nodes and included edges", async () => {
        const user = userEvent.setup();
        renderDialog();

        expect(screen.getByText("2 of 2 node(s) selected")).toBeInTheDocument();
        expect(
            screen.getByText("1 edge(s) will be included"),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("checkbox", { name: /^Cache/ }));

        expect(screen.getByText("1 of 2 node(s) selected")).toBeInTheDocument();
        expect(
            screen.getByText("0 edge(s) will be included"),
        ).toBeInTheDocument();
    });

    test("Select none unchecks every node, Select all re-checks them", async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole("button", { name: "Select none" }));
        expect(screen.getByText("0 of 2 node(s) selected")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Select all" }));
        expect(screen.getByText("2 of 2 node(s) selected")).toBeInTheDocument();
    });

    test("the confirm button is disabled once nothing is selected", async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole("button", { name: "Select none" }));

        expect(
            screen.getByRole("button", { name: /Merge \d+ node/ }),
        ).toBeDisabled();
    });

    test("confirming calls onConfirm with exactly the checked node ids", async () => {
        const user = userEvent.setup();
        const { onConfirm } = renderDialog();

        await user.click(screen.getByRole("checkbox", { name: /^Cache/ }));
        await user.click(
            screen.getByRole("button", { name: /Merge \d+ node/ }),
        );

        expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
            new Set(["queue"]),
            new Set(),
            [],
        );
    });

    test("Cancel calls onCancel without calling onConfirm", async () => {
        const user = userEvent.setup();
        const { onConfirm, onCancel } = renderDialog();

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(onCancel).toHaveBeenCalledOnce();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    test("pressing Escape calls onCancel", async () => {
        const user = userEvent.setup();
        const { onCancel } = renderDialog();

        await user.keyboard("{Escape}");

        expect(onCancel).toHaveBeenCalledOnce();
    });

    test("flags a node whose label already exists in the current architecture", () => {
        renderDialog({ existingFoldedLabels: new Set(["cache"]) });

        expect(
            screen.getByRole("checkbox", { name: /^Cache.*renamed/ }),
        ).toBeInTheDocument();
        const queueBox = screen.getByRole("checkbox", {
            name: "Message Queue queue",
        });
        expect(queueBox.closest("label")).not.toHaveTextContent(/renamed/i);
    });

    test("renders a checked checkbox for an incoming edge when both endpoints are selected", () => {
        renderDialog();

        expect(
            screen.getByRole("checkbox", { name: "Message Queue → Cache" }),
        ).toBeChecked();
    });

    test("unchecking an edge drops it from the included count but keeps both nodes selected", async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(
            screen.getByRole("checkbox", { name: "Message Queue → Cache" }),
        );

        expect(screen.getByText("2 of 2 node(s) selected")).toBeInTheDocument();
        expect(
            screen.getByText("0 edge(s) will be included"),
        ).toBeInTheDocument();
    });

    test("deselecting an endpoint disables and unchecks its edge", async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole("checkbox", { name: /^Cache/ }));

        const edgeBox = screen.getByRole("checkbox", {
            name: "Message Queue → Cache",
        });
        expect(edgeBox).toBeDisabled();
        expect(edgeBox).not.toBeChecked();
    });

    test("re-selecting a deselected endpoint restores an edge that wasn't explicitly dropped", async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole("checkbox", { name: /^Cache/ }));
        await user.click(screen.getByRole("checkbox", { name: /^Cache/ }));

        expect(
            screen.getByRole("checkbox", { name: "Message Queue → Cache" }),
        ).toBeChecked();
    });

    test("an explicitly dropped edge stays dropped after its node is toggled off and back on", async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(
            screen.getByRole("checkbox", { name: "Message Queue → Cache" }),
        );
        await user.click(screen.getByRole("checkbox", { name: /^Cache/ }));
        await user.click(screen.getByRole("checkbox", { name: /^Cache/ }));

        expect(
            screen.getByRole("checkbox", { name: "Message Queue → Cache" }),
        ).not.toBeChecked();
    });

    test("confirming calls onConfirm with the dropped edge's id even though both nodes are selected", async () => {
        const user = userEvent.setup();
        const { onConfirm } = renderDialog();

        await user.click(
            screen.getByRole("checkbox", { name: "Message Queue → Cache" }),
        );
        await user.click(
            screen.getByRole("button", { name: /Merge \d+ node/ }),
        );

        expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
            new Set(["queue", "cache"]),
            new Set(["edge-queue-cache"]),
            [],
        );
    });

    test("Connect doesn't render when fewer than two nodes are selected", async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole("button", { name: "Select none" }));
        await user.click(screen.getByRole("checkbox", { name: /^Cache/ }));

        expect(
            screen.queryByRole("combobox", { name: "Connect from" }),
        ).not.toBeInTheDocument();
    });

    test("Connect defaults From/To to the first two nodes with no connection yet", () => {
        renderDialog({ architecture: disjointThree });

        expect(
            screen.getByRole("combobox", { name: "Connect from" }),
        ).toHaveValue("incoming:a");
        expect(
            screen.getByRole("combobox", { name: "Connect to" }),
        ).toHaveValue("incoming:b");
    });

    test("adding a connection lists it and counts it as an included edge", async () => {
        const user = userEvent.setup();
        renderDialog({ architecture: disjointThree });

        await user.click(
            screen.getByRole("button", { name: "Add connection" }),
        );

        expect(screen.getByText("Alpha → Beta")).toBeInTheDocument();
        expect(
            screen.getByText("1 edge(s) will be included"),
        ).toBeInTheDocument();
    });

    test("confirming passes added connections as the third argument", async () => {
        const user = userEvent.setup();
        const { onConfirm } = renderDialog({ architecture: disjointThree });

        await user.click(
            screen.getByRole("button", { name: "Add connection" }),
        );
        await user.click(
            screen.getByRole("button", { name: /Merge \d+ node/ }),
        );

        expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
            new Set(["a", "b", "c"]),
            new Set(),
            [{ source: "incoming:a", target: "incoming:b" }],
        );
    });

    test("removing an added connection drops it from the list and the count", async () => {
        const user = userEvent.setup();
        renderDialog({ architecture: disjointThree });

        await user.click(
            screen.getByRole("button", { name: "Add connection" }),
        );
        await user.click(
            screen.getByRole("button", {
                name: "Remove connection: Alpha to Beta",
            }),
        );

        expect(screen.queryByText("Alpha → Beta")).not.toBeInTheDocument();
        expect(
            screen.getByText("0 edge(s) will be included"),
        ).toBeInTheDocument();
    });

    test("deselecting a node used in an added connection also drops that connection", async () => {
        const user = userEvent.setup();
        renderDialog({ architecture: disjointThree });

        await user.click(
            screen.getByRole("button", { name: "Add connection" }),
        );
        await user.click(screen.getByRole("checkbox", { name: /^Alpha/ }));

        expect(screen.queryByText("Alpha → Beta")).not.toBeInTheDocument();
        expect(
            screen.getByText("0 edge(s) will be included"),
        ).toBeInTheDocument();
    });

    test("From options exclude a node once it already has an outgoing connection", async () => {
        const user = userEvent.setup();
        renderDialog({ architecture: disjointThree });

        await user.click(
            screen.getByRole("button", { name: "Add connection" }),
        );

        const fromSelect = screen.getByRole("combobox", {
            name: "Connect from",
        });
        expect(
            within(fromSelect).queryByRole("option", { name: /^Alpha/ }),
        ).not.toBeInTheDocument();
        expect(
            within(fromSelect).getByRole("option", { name: /^Gamma/ }),
        ).toBeInTheDocument();
    });

    test("To options exclude a node that would close a cycle back through an existing connection", async () => {
        const user = userEvent.setup();
        renderDialog({ architecture: disjointThree });

        await user.click(
            screen.getByRole("button", { name: "Add connection" }),
        );

        const toSelect = screen.getByRole("combobox", { name: "Connect to" });
        expect(
            within(toSelect).queryByRole("option", { name: /^Alpha/ }),
        ).not.toBeInTheDocument();
        expect(
            within(toSelect).getByRole("option", { name: /^Gamma/ }),
        ).toBeInTheDocument();
    });

    const existingWithRoom: Architecture = {
        nodes: [
            {
                id: "web",
                position: { x: 0, y: 0 },
                data: { label: "Web Server" },
            },
        ],
        edges: [],
    };

    const existingChain: Architecture = {
        nodes: [
            {
                id: "internet",
                position: { x: 0, y: 0 },
                data: { label: "Internet" },
            },
            {
                id: "web",
                position: { x: 0, y: 0 },
                data: { label: "Web Server" },
            },
        ],
        edges: [{ id: "edge-internet-web", source: "internet", target: "web" }],
    };

    const collidingCurrent: Architecture = {
        nodes: [
            {
                id: "cache",
                position: { x: 0, y: 0 },
                data: { label: "Old Cache" },
            },
        ],
        edges: [],
    };

    test("an existing node appears as a Connect option, grouped separately from the incoming file", () => {
        renderDialog({ current: existingWithRoom });

        const fromSelect = screen.getByRole("combobox", {
            name: "Connect from",
        });
        expect(
            within(fromSelect).getByRole("group", {
                name: "Existing architecture",
            }),
        ).toBeInTheDocument();
        expect(
            within(fromSelect).getByRole("option", { name: "Web Server" }),
        ).toBeInTheDocument();
    });

    test("Connect can link an existing node to an incoming node; onConfirm reports the current-origin key literally", async () => {
        const user = userEvent.setup();
        const { onConfirm } = renderDialog({ current: existingWithRoom });

        expect(
            screen.getByRole("combobox", { name: "Connect from" }),
        ).toHaveValue("current:web");
        expect(
            screen.getByRole("combobox", { name: "Connect to" }),
        ).toHaveValue("incoming:queue");

        await user.click(
            screen.getByRole("button", { name: "Add connection" }),
        );
        await user.click(
            screen.getByRole("button", { name: /Merge \d+ node/ }),
        );

        expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
            new Set(["queue", "cache"]),
            new Set(),
            [{ source: "current:web", target: "incoming:queue" }],
        );
    });

    test("an existing node with an outgoing edge is excluded from Connect From options", () => {
        renderDialog({ current: existingChain });

        const fromSelect = screen.getByRole("combobox", {
            name: "Connect from",
        });
        expect(
            within(fromSelect).queryByRole("option", { name: "Internet" }),
        ).not.toBeInTheDocument();
        expect(
            within(fromSelect).getByRole("option", { name: "Web Server" }),
        ).toBeInTheDocument();
    });

    test("an existing node and a colliding incoming node (same raw id) both appear as distinct Connect options", () => {
        renderDialog({ current: collidingCurrent });

        const fromSelect = screen.getByRole("combobox", {
            name: "Connect from",
        });
        expect(
            within(fromSelect).getByRole("option", { name: "Old Cache" }),
        ).toBeInTheDocument();
        expect(
            within(fromSelect).getByRole("option", { name: "Cache" }),
        ).toBeInTheDocument();
    });

    test("deselecting an incoming node also drops an added connection to an existing node", async () => {
        const user = userEvent.setup();
        renderDialog({ current: existingWithRoom });

        await user.click(
            screen.getByRole("button", { name: "Add connection" }),
        );
        await user.click(
            screen.getByRole("checkbox", { name: "Message Queue queue" }),
        );

        expect(
            screen.queryByText("Web Server → Message Queue"),
        ).not.toBeInTheDocument();
    });
});
