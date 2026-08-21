import { ArchitectureCanvas } from "@/components/architecture-canvas";
import { exampleArchitecture } from "@/data/example-architecture";

export default function Home() {
  return (
    <div className="flex h-screen w-full flex-col">
      <header className="border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">
        <h1 className="text-xl font-semibold">Architecture Model</h1>
      </header>
      <div className="flex-1">
        <ArchitectureCanvas architecture={exampleArchitecture} />
      </div>
    </div>
  );
}
