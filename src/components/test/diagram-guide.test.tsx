// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, describe, expect, test } from "vitest";

import { DiagramGuide } from "@/components/diagram-guide";

afterEach(cleanup);

function renderGuide() {
    return render(
        <ReactFlowProvider>
            <DiagramGuide />
        </ReactFlowProvider>,
    );
}

describe("DiagramGuide", () => {
    test("starts closed so it never covers the canvas uninvited", () => {
        renderGuide();
        expect(
            screen.queryByRole("region", { name: "Diagram navigation guide" }),
        ).not.toBeInTheDocument();
    });

    test("the toggle button opens the guide, reflecting the state via aria-expanded", async () => {
        const user = userEvent.setup();
        renderGuide();
        const toggle = screen.getByTitle("Diagram navigation guide");
        expect(toggle).toHaveAttribute("aria-expanded", "false");

        await user.click(toggle);

        expect(
            screen.getByRole("region", { name: "Diagram navigation guide" }),
        ).toBeInTheDocument();
        expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    test("lists navigation tips covering panning, connecting, and deleting", async () => {
        const user = userEvent.setup();
        renderGuide();
        await user.click(screen.getByTitle("Diagram navigation guide"));

        expect(screen.getByText(/Pan:/)).toBeInTheDocument();
        expect(screen.getByText(/Connect nodes:/)).toBeInTheDocument();
        expect(screen.getByText(/Delete:/)).toBeInTheDocument();
    });

    test("the toggle button closes the guide again while it's open", async () => {
        const user = userEvent.setup();
        renderGuide();
        const toggle = screen.getByTitle("Diagram navigation guide");
        await user.click(toggle);

        await user.click(toggle);

        expect(
            screen.queryByRole("region", { name: "Diagram navigation guide" }),
        ).not.toBeInTheDocument();
    });

    test("the close button inside the panel also closes it", async () => {
        const user = userEvent.setup();
        renderGuide();
        await user.click(screen.getByTitle("Diagram navigation guide"));

        await user.click(screen.getByTitle("Close guide"));

        expect(
            screen.queryByRole("region", { name: "Diagram navigation guide" }),
        ).not.toBeInTheDocument();
    });
});
