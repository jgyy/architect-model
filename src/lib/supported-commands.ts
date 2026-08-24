/**
 * Description of one console command for the `help` output: usage
 * syntax, a worked example, accepted alias phrasings, and an optional
 * note about a side effect or constraint.
 */
type CommandDoc = {
    usage: string;
    example: string;
    aliases: string[];
    note?: string;
};

/**
 * Full list of commands documented by the console's `help` output, one
 * entry per command family. Raw data that COMMAND_USAGE and
 * SUPPORTED_COMMANDS derive from.
 */
const COMMAND_DOCS: CommandDoc[] = [
    {
        usage: "add node <label>",
        example: 'e.g. "add node Cache"',
        aliases: ["create node", "new node", "add a node called"],
        note: "also appends a simulation step reaching that node",
    },
    {
        usage: "connect <A> to <B>",
        example: 'e.g. "connect Web Server to Cache"',
        aliases: ["connect A and B", "link A to B", "link A and B"],
        note: "each node allows only 1 outgoing/1 incoming edge; no self-loops or cycles",
    },
    {
        usage: "remove node <label>",
        example: 'e.g. "remove node Cache"',
        aliases: ["delete node"],
        note: "also removes its simulation step",
    },
    {
        usage: "remove edge <A> to <B>",
        example: 'e.g. "remove edge Web Server to Cache"',
        aliases: ["delete edge", "disconnect A from B", "disconnect A and B"],
    },
    {
        usage: "rename node <A> to <B>",
        example: 'e.g. "rename node Cache to Redis"',
        aliases: ["relabel node A to B"],
    },
    {
        usage: "move node <label> to step <n>",
        example: 'e.g. "move node Cache to step 2"',
        aliases: ["reorder node"],
        note: "shifts the surrounding steps to make room",
    },
    {
        usage: "export",
        example: 'e.g. "export" downloads the current architecture as JSON',
        aliases: [],
        note: "toolbar-only Import (needs a file) does the reverse",
    },
    {
        usage: "undo",
        example: 'e.g. "undo" after "add node Cache" removes it again',
        aliases: [],
        note: "reverts the last command; also a toolbar button",
    },
    {
        usage: "redo",
        example: 'e.g. "redo" re-applies the last undone command',
        aliases: [],
        note: "also a toolbar button",
    },
];

/**
 * Every command's usage line, in COMMAND_DOCS order, with no
 * example/alias/note text.
 */
export const COMMAND_USAGE = COMMAND_DOCS.map((doc) => doc.usage);

const INDENT = "    ";

/**
 * Renders one CommandDoc into its multi-line help block: usage line,
 * indented example, an indented alias line when aliases exist, and an
 * indented note when present.
 * @param doc - command description to format
 * @returns newline-joined formatted block of text
 */
function formatCommandDoc(doc: CommandDoc): string {
    const lines = [doc.usage, `${INDENT}${doc.example}`];
    if (doc.aliases.length > 0) {
        const aliasWord = doc.aliases.length > 1 ? "aliases" : "alias";
        lines.push(`${INDENT}${aliasWord}: ${doc.aliases.join(", ")}`);
    }
    if (doc.note) lines.push(`${INDENT}${doc.note}`);
    return lines.join("\n");
}

/**
 * One help-text block per command, COMMAND_DOCS order, wrapped inside
 * 80 columns; joined by HELP_MESSAGE.
 */
export const SUPPORTED_COMMANDS = COMMAND_DOCS.map(formatCommandDoc);

/**
 * Text shown for the console's `help` command: header plus
 * SUPPORTED_COMMANDS blocks, separated by blank lines.
 */
export const HELP_MESSAGE = `Commands:\n\n${SUPPORTED_COMMANDS.join("\n\n")}`;
