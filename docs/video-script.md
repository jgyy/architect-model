# Demo video script

A shot list for the assignment's "Demo proof" deliverable (screen recording alternative to
screenshots, see `programming-assignment.md`). Target length **60-75s**, comfortably inside the
30-90s window. No voiceover needed - the console log narrates every command's outcome on screen -
but optional lines to say out loud are included if you'd rather talk over it.

## Setup

1. `npm run dev`, open `http://localhost:3000` at roughly 1280x800.
2. Click **Clear history** once so the seeded example (Internet → Web Server → Database, step 1/3)
   is showing before you hit record. Reference frames for each beat are in `docs/demo/`.
3. Start recording (macOS: QuickTime "New Screen Recording"; Windows: Xbox Game Bar `Win+G`; Linux:
   OBS or `gnome-screenshot`/`wf-recorder`). Crop to the browser window if your tool allows it.

## Required beats (~55s) - before/after + simulation highlighting

| Time      | On-screen action                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00-0:06 | Sit on the loaded app: 3-node seeded architecture on the canvas, Simulation panel reads "Step 1/3, Attacker starts from Internet". This is the "before" state. |
| 0:06-0:12 | Click the console input, type `add node Cache`, press Enter. A fourth node appears on the canvas; the log prints `Added node "Cache" as simulation step 4.` |
| 0:12-0:18 | Type `connect Database to Cache`, press Enter. The edge is drawn; log prints `Connected "Database" to "Cache".` This is the "after" state - matches `docs/demo/2-after.png`. |
| 0:18-0:45 | Click **Next step** in the Simulation panel three times, pausing ~2s on each. Narrate (or let it speak for itself): the current node's ring switches Internet → Web Server → Database → Cache in amber, and each node/edge already visited turns red ("traversed") - the attacker's blast radius growing one hop at a time. |
| 0:45-0:55 | Hold on the final frame: all four nodes ringed/edged red except the amber ring on Cache (step 4/4) - matches `docs/demo/5-simulation-final.png`. |

## Optional beats (~15-20s) - if you have time left

| Time      | On-screen action                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:55-1:03 | Type `connect Nonexistent to Database`, press Enter. Log prints a red `No node named "Nonexistent".` entry; the architecture is unchanged - demonstrates inline validation, matches `docs/demo/3-invalid-command.png`. |
| 1:03-1:12 | Click **Undo** twice (reverts the connect, then the add) to show the command history round-tripping, then **Redo** once to bring Cache back. |

## Optional lines to say out loud

- "This is Blast Radius - you describe a system architecture in plain text, and it renders as a
  React Flow diagram you can also edit directly."
- While typing: "Adding a node and connecting it are just typed commands - no mouse required."
- During simulation: "Stepping through highlights the attacker's path: amber is the current step,
  red is everywhere already reached - so a reviewer can see exactly where the blast radius stops."
- (If including validation) "Bad references are rejected inline, with the architecture left
  untouched."

## Cutting it short

If you're tight on time, drop the two optional beats entirely - the required before/after-update
and simulation-highlighting beats (0:00-0:55 above) already satisfy the assignment on their own
and land at ~55s, well inside the 30-90s window.
