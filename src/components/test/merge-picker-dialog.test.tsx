// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

function renderDialog(
    overrides: {
        onConfirm?: (ids: Set<string>, excludedEdgeIds: Set<string>) => void;
        onCancel?: () => void;
        existingFoldedLabels?: ReadonlySet<string>;
        architecture?: Architecture;
    } = {},
) {
    const onConfirm = overrides.onConfirm ?? vi.fn();
    const onCancel = overrides.onCancel ?? vi.fn();
    render(
        <MergePickerDialog
            fileName="extra.json"
            incoming={overrides.architecture ?? incoming}
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
        );
    });
});
