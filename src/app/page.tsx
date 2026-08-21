import { ArchitectureWorkspace } from "@/components/architecture-workspace";
import { exampleArchitecture } from "@/data/example-architecture";
import { exampleSimulationTrace } from "@/data/example-simulation";

export default function Home() {
    return (
        <div className="flex h-screen w-full flex-col">
            <header className="border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">
                <h1 className="text-xl font-semibold">Architecture Model</h1>
            </header>
            <div className="min-h-0 flex-1">
                <ArchitectureWorkspace
                    initialArchitecture={exampleArchitecture}
                    simulationTrace={exampleSimulationTrace}
                />
            </div>
        </div>
    );
}
