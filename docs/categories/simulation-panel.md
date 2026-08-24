# Panel (Prev/Next/Play/Pause)

`SimulationPanel` drives `currentStepIndex` via Prev/Next and a Play/Pause toggle backed by a recursive `setTimeout` (not `setInterval`) inside a `useEffect` keyed on `isPlaying`, so each tick re-reads the latest step and speed.

**Source:** `src/components/simulation-panel.tsx:1-146`

**Paused controls and entering play**

```mermaid
stateDiagram-v2
    [*] --> Paused
    Paused --> Paused: Prev (onStepChange(i-1), disabled at i=0)
    Paused --> Paused: Next (onStepChange(i+1), disabled at atLastStep)
    Paused --> Paused: speed select (onSpeedChange)
    Paused --> Playing: Play\n(disabled if stepCount<=1 or atLastStep)
```

**Playback loop and stopping**

```mermaid
stateDiagram-v2
    state Playing {
        [*] --> Waiting
        Waiting --> Waiting: setTimeout(PLAY_SPEEDS[speedIndex].intervalMs)
    }
    Playing --> Playing: getNextPlayIndex != null\nonStepChange(next)
    Playing --> Paused: Pause (toggle isPlaying)
    Playing --> Paused: getNextPlayIndex == null\nsetIsPlaying(false)
```

