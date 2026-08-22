import { ArchitectureWorkspace } from "@/components/architecture-workspace";
import { exampleArchitecture } from "@/data/example-architecture";

export default function Home() {
    return (
        <div className="flex h-screen w-full flex-col">
            <header className="border-b border-border bg-chrome px-6 py-3">
                <h1 className="text-sm font-semibold tracking-wide">
                    Architecture Model
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Describe a system in plain text, then step through a
                    simulated attacker&apos;s path across it.
                </p>
            </header>
            <div className="min-h-0 flex-1">
                <ArchitectureWorkspace
                    initialArchitecture={exampleArchitecture}
                />
            </div>
        </div>
    );
}
