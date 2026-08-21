import { ArchitectureWorkspace } from "@/components/architecture-workspace";
import { exampleArchitecture } from "@/data/example-architecture";
import { exampleSimulationTrace } from "@/data/example-simulation";

export default function Home() {
    return (
        <div className="flex h-screen w-full flex-col">
            <header className="border-b border-border bg-chrome px-6 py-3">
                <h1 className="text-sm font-semibold tracking-wide">
                    Architecture Model
                </h1>
            </header>
            <div className="min-h-0 flex-1">
                <ArchitectureWorkspace
                    initialArchitecture={exampleArchitecture}
                    initialSimulationTrace={exampleSimulationTrace}
                />
            </div>
        </div>
    );
}
