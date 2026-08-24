import type { Architecture } from "@/types/architecture";

/**
 * Sample starting graph; attack-path trace lives in node `data.description`.
 */
export const exampleArchitecture: Architecture = {
    nodes: [
        {
            id: "node-internet",
            position: { x: 0, y: 0 },
            data: {
                label: "Internet",
                description: "Attacker starts from Internet",
            },
        },
        {
            id: "node-web-server",
            position: { x: 250, y: 0 },
            data: {
                label: "Web Server",
                description: "Attacker reaches Web Server",
            },
        },
        {
            id: "node-database",
            position: { x: 500, y: 0 },
            data: {
                label: "Database",
                description: "Attacker accesses Database",
            },
        },
    ],
    edges: [
        {
            id: "edge-internet-web-server",
            source: "node-internet",
            target: "node-web-server",
        },
        {
            id: "edge-web-server-database",
            source: "node-web-server",
            target: "node-database",
        },
    ],
};
