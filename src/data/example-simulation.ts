import type { SimulationTrace } from "@/types/simulation";

export const exampleSimulationTrace: SimulationTrace = [
    {
        step: 1,
        nodeId: "node-internet",
        description: "Attacker starts from Internet",
    },
    {
        step: 2,
        nodeId: "node-web-server",
        description: "Attacker reaches Web Server",
    },
    {
        step: 3,
        nodeId: "node-database",
        description: "Attacker accesses Database",
    },
];
