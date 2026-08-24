import { ArchitectureWorkspace } from "@/components/architecture-workspace";
import { exampleArchitecture } from "@/data/example-architecture";

/**
 * Root route; server component that mounts {@link ArchitectureWorkspace},
 * seeded with the bundled example architecture.
 */
export default function Home() {
    return (
        <div className="flex h-screen w-full flex-col">
            <header className="flex shrink-0 items-center border-b border-border bg-chrome px-6 py-2">
                <h1 className="truncate text-sm font-semibold tracking-wide">
                    Blast Radius
                </h1>
            </header>
            <div className="min-h-0 flex-1">
                <ArchitectureWorkspace
                    initialArchitecture={exampleArchitecture}
                />
            </div>
            <footer className="flex shrink-0 items-center border-t border-border bg-chrome px-6 py-2">
                <p className="truncate text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                        1 · Describe
                    </span>{" "}
                    in plain text →{" "}
                    <span className="font-medium text-foreground">
                        2 · Architecture
                    </span>{" "}
                    appears on the canvas →{" "}
                    <span className="font-medium text-foreground">
                        3 · Simulate
                    </span>{" "}
                    an attacker&apos;s path across it.
                </p>
            </footer>
        </div>
    );
}
