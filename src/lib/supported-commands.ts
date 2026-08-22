// Human-readable syntax reference, printed by the console's `help` command
export const SUPPORTED_COMMANDS = [
    'add node <label>              — e.g. "add node Cache" (aliases: create node, new node, add a node called)',
    'connect <A> to <B>            — e.g. "connect Web Server to Cache" (aliases: connect A and B, link A to B, link A and B)',
    'remove node <label>           — e.g. "remove node Cache" (alias: delete node)',
    'remove edge <A> to <B>        — e.g. "remove edge Web Server to Cache" (aliases: delete edge, disconnect A from B, disconnect A and B)',
    'add step <label>              — e.g. "add step Cache" (appends a simulation step reaching that node)',
    'insert step <n> <label>       — e.g. "insert step 2 Cache" (inserts a step at that position, shifting later ones down)',
    'set step <n> description ...  — e.g. "set step 2 description Attacker pivots to Cache"',
    'remove step <n>               — e.g. "remove step 2"',
    'move step <a> to <b>          — e.g. "move step 3 to 1" (relocates a step, renumbering the rest)',
];
