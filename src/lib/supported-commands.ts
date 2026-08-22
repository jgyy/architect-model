// Human-readable syntax reference, printed by the console's `help` command
export const SUPPORTED_COMMANDS = [
    'add node <label>              — e.g. "add node Cache" (aliases: create node, new node, add a node called) — also appends a simulation step reaching that node',
    'connect <A> to <B>            — e.g. "connect Web Server to Cache" (aliases: connect A and B, link A to B, link A and B)',
    'remove node <label>           — e.g. "remove node Cache" (alias: delete node) — also removes its simulation step',
    'remove edge <A> to <B>        — e.g. "remove edge Web Server to Cache" (aliases: delete edge, disconnect A from B, disconnect A and B)',
];
