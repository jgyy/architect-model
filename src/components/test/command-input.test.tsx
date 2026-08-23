// @vitest-environment jsdom
import { useState } from "react";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CommandInput } from "@/components/command-input";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

afterEach(cleanup);

function makeNode(id: string, label: string): ArchitectureNode {
    return {
        id,
        type: "default",
        position: { x: 0, y: 0 },
        data: { label },
    };
}

// "Cache" and "Cluster" both match the prefix "c"
const TWO_NODE_ARCHITECTURE: Architecture = {
    nodes: [makeNode("n-cache", "Cache"), makeNode("n-cluster", "Cluster")],
    edges: [],
};

function ControlledCommandInput({
    architecture,
    commands,
    onSubmit,
    onChangeSpy,
}: {
    architecture: Architecture;
    commands: string[];
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    onChangeSpy?: (value: string) => void;
}) {
    const [value, setValue] = useState("");
    return (
        <CommandInput
            value={value}
            onChange={(next) => {
                onChangeSpy?.(next);
                setValue(next);
            }}
            onSubmit={onSubmit}
            architecture={architecture}
            commands={commands}
        />
    );
}

function renderCommandInput({
    architecture = TWO_NODE_ARCHITECTURE,
    commands = [],
    onSubmit = vi.fn(),
    onChangeSpy,
}: {
    architecture?: Architecture;
    commands?: string[];
    onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
    onChangeSpy?: (value: string) => void;
} = {}) {
    render(
        <ControlledCommandInput
            architecture={architecture}
            commands={commands}
            onSubmit={onSubmit}
            onChangeSpy={onChangeSpy}
        />,
    );
    return {
        input: screen.getByRole("combobox", { name: "Command" }),
        onSubmit,
    };
}

describe("CommandInput", () => {
    describe("typing", () => {
        test("calls onChange with the new value as the user types", async () => {
            const user = userEvent.setup();
            const onChangeSpy = vi.fn();
            const { input } = renderCommandInput({ onChangeSpy });

            await user.type(input, "add");

            expect(onChangeSpy.mock.calls.map((call) => call[0])).toEqual([
                "a",
                "ad",
                "add",
            ]);
            expect(input).toHaveValue("add");
        });
    });

    describe("node-reference suggestions", () => {
        test("typing a partial node reference shows a listbox of matching nodes", async () => {
            const user = userEvent.setup();
            const { input } = renderCommandInput();

            await user.type(input, "connect c");

            const listbox = screen.getByRole("listbox");
            const options = within(listbox).getAllByRole("option");
            expect(options).toHaveLength(2);
            expect(options[0]).toHaveTextContent("Cache");
            expect(options[1]).toHaveTextContent("Cluster");
        });

        test("does not show a listbox for a node that doesn't match any command pattern", async () => {
            const user = userEvent.setup();
            renderCommandInput();
            const input = screen.getByRole("combobox", { name: "Command" });

            await user.type(input, "connect database");

            expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        });

        test("ArrowDown moves the active option forward and wraps around", async () => {
            const user = userEvent.setup();
            const { input } = renderCommandInput();
            await user.type(input, "connect c");

            const listboxBefore = screen.getByRole("listbox");
            const [cache, cluster] =
                within(listboxBefore).getAllByRole("option");
            expect(cache).toHaveAttribute("aria-selected", "true");
            expect(cluster).toHaveAttribute("aria-selected", "false");

            await user.keyboard("{ArrowDown}");
            const listboxAfterOne = screen.getByRole("listbox");
            const afterOne = within(listboxAfterOne).getAllByRole("option");
            expect(afterOne[0]).toHaveAttribute("aria-selected", "false");
            expect(afterOne[1]).toHaveAttribute("aria-selected", "true");

            await user.keyboard("{ArrowDown}");
            const listboxAfterTwo = screen.getByRole("listbox");
            const afterTwo = within(listboxAfterTwo).getAllByRole("option");
            expect(afterTwo[0]).toHaveAttribute("aria-selected", "true");
            expect(afterTwo[1]).toHaveAttribute("aria-selected", "false");
        });

        test("ArrowUp moves the active option backward and wraps around", async () => {
            const user = userEvent.setup();
            const { input } = renderCommandInput();
            await user.type(input, "connect c");

            await user.keyboard("{ArrowUp}");
            const listbox = screen.getByRole("listbox");
            const options = within(listbox).getAllByRole("option");
            expect(options[0]).toHaveAttribute("aria-selected", "false");
            expect(options[1]).toHaveAttribute("aria-selected", "true");
        });

        test("Enter selects the active option and calls onChange with the completed text", async () => {
            const user = userEvent.setup();
            const onChangeSpy = vi.fn();
            const { input } = renderCommandInput({ onChangeSpy });
            await user.type(input, "connect c");
            onChangeSpy.mockClear();

            // move active option from Cache to Cluster, then confirm
            await user.keyboard("{ArrowDown}{Enter}");

            expect(onChangeSpy).toHaveBeenCalledWith("connect Cluster ");
            expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        });

        test("accepting a suggestion mid history-recall ends the recall, so a later ArrowDown doesn't snap back to the pre-recall draft", async () => {
            const user = userEvent.setup();
            const onChangeSpy = vi.fn();
            const { input } = renderCommandInput({
                commands: ["connect Ca"],
                onChangeSpy,
            });
            await user.click(input);

            // ArrowUp recalls "connect Ca" from history, opening the listbox
            await user.keyboard("{ArrowUp}");
            expect(input).toHaveValue("connect Ca");
            expect(screen.getByRole("listbox")).toBeInTheDocument();

            // Accept the suggestion without typing anything else
            await user.keyboard("{Enter}");
            expect(input).toHaveValue("connect Cache ");

            onChangeSpy.mockClear();
            await user.keyboard("{ArrowDown}");

            // Before the fix, historyState was untouched by accepting the suggestion
            expect(onChangeSpy).not.toHaveBeenCalled();
            expect(input).toHaveValue("connect Cache ");
        });

        test("clicking an option selects it and calls onChange with the completed text", async () => {
            const user = userEvent.setup();
            const onChangeSpy = vi.fn();
            const { input } = renderCommandInput({ onChangeSpy });
            await user.type(input, "connect c");
            onChangeSpy.mockClear();

            const listbox = screen.getByRole("listbox");
            await user.click(within(listbox).getByText("Cache"));

            expect(onChangeSpy).toHaveBeenCalledWith("connect Cache ");
            expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        });

        test("aria-activedescendant tracks the active option so screen readers announce it", async () => {
            const user = userEvent.setup();
            const { input } = renderCommandInput();
            await user.type(input, "connect c");

            expect(input).toHaveAttribute(
                "aria-activedescendant",
                "command-suggestion-n-cache",
            );

            await user.keyboard("{ArrowDown}");
            expect(input).toHaveAttribute(
                "aria-activedescendant",
                "command-suggestion-n-cluster",
            );
        });

        test("aria-activedescendant is absent when there's no listbox open", () => {
            const { input } = renderCommandInput();
            expect(input).not.toHaveAttribute("aria-activedescendant");
        });

        test("Escape dismisses the suggestion list", async () => {
            const user = userEvent.setup();
            const { input } = renderCommandInput();
            await user.type(input, "connect c");
            expect(screen.getByRole("listbox")).toBeInTheDocument();

            await user.keyboard("{Escape}");

            expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        });
    });

    describe("command history recall", () => {
        test("ArrowUp with no suggestions open recalls the most recent command, then the one before it", async () => {
            const user = userEvent.setup();
            const onChangeSpy = vi.fn();
            const { input } = renderCommandInput({
                commands: ["add node A", "add node B"],
                onChangeSpy,
            });
            await user.click(input);

            await user.keyboard("{ArrowUp}");
            expect(onChangeSpy).toHaveBeenLastCalledWith("add node B");
            expect(input).toHaveValue("add node B");

            await user.keyboard("{ArrowUp}");
            expect(onChangeSpy).toHaveBeenLastCalledWith("add node A");
            expect(input).toHaveValue("add node A");
        });

        test("ArrowUp clamps at the oldest command instead of wrapping around", async () => {
            const user = userEvent.setup();
            const { input } = renderCommandInput({ commands: ["only one"] });
            await user.click(input);

            await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");

            expect(input).toHaveValue("only one");
        });

        test("ArrowDown after ArrowUp steps back to the newer command, then to the original draft", async () => {
            const user = userEvent.setup();
            const onChangeSpy = vi.fn();
            const { input } = renderCommandInput({
                commands: ["add node A", "add node B"],
                onChangeSpy,
            });
            await user.click(input);
            await user.type(input, "my draft");
            onChangeSpy.mockClear();

            await user.keyboard("{ArrowUp}{ArrowUp}");
            expect(input).toHaveValue("add node A");

            await user.keyboard("{ArrowDown}");
            expect(input).toHaveValue("add node B");

            await user.keyboard("{ArrowDown}");
            expect(input).toHaveValue("my draft");
        });

        test("ArrowDown with no recall in progress and an empty command list is a no-op", async () => {
            const user = userEvent.setup();
            const onChangeSpy = vi.fn();
            const { input } = renderCommandInput({ commands: [], onChangeSpy });
            await user.click(input);

            await user.keyboard("{ArrowDown}");

            expect(onChangeSpy).not.toHaveBeenCalled();
            expect(input).toHaveValue("");
        });
    });

    describe("submitting", () => {
        test("pressing Enter with no suggestions open submits the form", async () => {
            const user = userEvent.setup();
            const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) =>
                event.preventDefault(),
            );
            const { input } = renderCommandInput({ onSubmit });

            await user.type(input, "add node Cache{Enter}");

            expect(onSubmit).toHaveBeenCalledTimes(1);
        });

        test("a submit event on the form calls onSubmit", () => {
            const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) =>
                event.preventDefault(),
            );
            const { input } = renderCommandInput({ onSubmit });
            const form = input.closest("form");
            expect(form).not.toBeNull();

            form?.requestSubmit();

            expect(onSubmit).toHaveBeenCalledTimes(1);
        });
    });
});
