export type SimulationStep = {
    step: number;
    nodeId: string;
    description: string;
};

export type SimulationTrace = SimulationStep[];
