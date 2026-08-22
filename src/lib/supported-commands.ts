// Human-readable syntax reference, printed by the console's `help` command
type CommandDoc = {
    usage: string;
    example: string;
    aliases: string[];
    note?: string;
};

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
        note: "A and B may be the same node (self-loop); cycles are allowed",
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
];

// Every command's plain usage line, in a fixed order
export const COMMAND_USAGE = COMMAND_DOCS.map((doc) => doc.usage);

const INDENT = "    ";

function formatCommandDoc(doc: CommandDoc): string {
    const aliasWord = doc.aliases.length > 1 ? "aliases" : "alias";
    const lines = [
        doc.usage,
        `${INDENT}${doc.example}`,
        `${INDENT}${aliasWord}: ${doc.aliases.join(", ")}`,
    ];
    if (doc.note) lines.push(`${INDENT}${doc.note}`);
    return lines.join("\n");
}

// One entry per command, each hard-wrapped well inside the console's 80
export const SUPPORTED_COMMANDS = COMMAND_DOCS.map(formatCommandDoc);

export const HELP_MESSAGE = `Commands:\n\n${SUPPORTED_COMMANDS.join("\n\n")}`;
