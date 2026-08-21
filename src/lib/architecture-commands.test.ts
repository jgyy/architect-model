import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/architecture-commands";
import type { Architecture } from "@/types/architecture";

const emptyArchitecture: Architecture = { nodes: [], edges: [] };

describe("parseCommand", () => {
  test("adds a node with the given label", () => {
    const result = parseCommand("add node Cache", emptyArchitecture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.architecture.nodes).toHaveLength(1);
    expect(result.architecture.nodes[0].data.label).toBe("Cache");
  });

  test("assigns a unique id when a node with the same slug already exists", () => {
    const withCache = parseCommand("add node Cache", emptyArchitecture);
    if (!withCache.ok) throw new Error("expected first add to succeed");

    const result = parseCommand("add node Cache", withCache.architecture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.architecture.nodes).toHaveLength(2);
    const ids = result.architecture.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(2);
  });

  test("connects two existing nodes by label", () => {
    const architecture: Architecture = {
      nodes: [
        { id: "node-web-server", position: { x: 0, y: 0 }, data: { label: "Web Server" } },
        { id: "node-database", position: { x: 250, y: 0 }, data: { label: "Database" } },
      ],
      edges: [],
    };

    const result = parseCommand("connect Web Server to Database", architecture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.architecture.edges).toHaveLength(1);
    expect(result.architecture.edges[0]).toMatchObject({
      source: "node-web-server",
      target: "node-database",
    });
  });

  test("fails to connect when a node does not exist", () => {
    const architecture: Architecture = {
      nodes: [{ id: "node-web-server", position: { x: 0, y: 0 }, data: { label: "Web Server" } }],
      edges: [],
    };

    const result = parseCommand("connect Web Server to Database", architecture);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected connect to fail");
    expect(result.message).toContain("Database");
  });

  test("removes a node and any edges connected to it", () => {
    const architecture: Architecture = {
      nodes: [
        { id: "node-web-server", position: { x: 0, y: 0 }, data: { label: "Web Server" } },
        { id: "node-database", position: { x: 250, y: 0 }, data: { label: "Database" } },
      ],
      edges: [
        { id: "edge-web-server-database", source: "node-web-server", target: "node-database" },
      ],
    };

    const result = parseCommand("remove node Web Server", architecture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.architecture.nodes).toHaveLength(1);
    expect(result.architecture.nodes[0].data.label).toBe("Database");
    expect(result.architecture.edges).toHaveLength(0);
  });

  test("fails to remove a node that does not exist", () => {
    const result = parseCommand("remove node Cache", emptyArchitecture);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected remove to fail");
    expect(result.message).toBe('No node named "Cache".');
  });

  test("removes an edge between two nodes", () => {
    const architecture: Architecture = {
      nodes: [
        { id: "node-web-server", position: { x: 0, y: 0 }, data: { label: "Web Server" } },
        { id: "node-database", position: { x: 250, y: 0 }, data: { label: "Database" } },
      ],
      edges: [
        { id: "edge-web-server-database", source: "node-web-server", target: "node-database" },
      ],
    };

    const result = parseCommand("remove edge Web Server to Database", architecture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.architecture.edges).toHaveLength(0);
    expect(result.architecture.nodes).toHaveLength(2);
  });

  test("fails to remove an edge that does not exist", () => {
    const architecture: Architecture = {
      nodes: [
        { id: "node-web-server", position: { x: 0, y: 0 }, data: { label: "Web Server" } },
        { id: "node-database", position: { x: 250, y: 0 }, data: { label: "Database" } },
      ],
      edges: [],
    };

    const result = parseCommand("remove edge Web Server to Database", architecture);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected remove edge to fail");
    expect(result.message).toBe('No edge from "Web Server" to "Database".');
  });

  test("rejects connecting a node to itself", () => {
    const architecture: Architecture = {
      nodes: [{ id: "node-web-server", position: { x: 0, y: 0 }, data: { label: "Web Server" } }],
      edges: [],
    };

    const result = parseCommand("connect Web Server to Web Server", architecture);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected self-connect to fail");
    expect(result.message).toBe('Cannot connect "Web Server" to itself.');
  });

  test("rejects connecting the same two nodes twice instead of creating a duplicate edge", () => {
    const architecture: Architecture = {
      nodes: [
        { id: "node-web-server", position: { x: 0, y: 0 }, data: { label: "Web Server" } },
        { id: "node-database", position: { x: 250, y: 0 }, data: { label: "Database" } },
      ],
      edges: [],
    };
    const first = parseCommand("connect Web Server to Database", architecture);
    if (!first.ok) throw new Error("expected first connect to succeed");

    const result = parseCommand("connect Web Server to Database", first.architecture);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected duplicate connect to fail");
    expect(result.message).toBe(
      'An edge from "Web Server" to "Database" already exists.',
    );
    expect(first.architecture.edges).toHaveLength(1);
  });

  test("prefers an exact label match over a substring match", () => {
    const architecture: Architecture = {
      nodes: [
        { id: "node-redis-cache", position: { x: 0, y: 0 }, data: { label: "Redis Cache" } },
        { id: "node-cache", position: { x: 250, y: 0 }, data: { label: "Cache" } },
      ],
      edges: [],
    };

    const result = parseCommand("remove node Cache", architecture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toBe('Removed node "Cache".');
    expect(result.architecture.nodes).toHaveLength(1);
    expect(result.architecture.nodes[0].data.label).toBe("Redis Cache");
  });

  test("resolves connection labels correctly even when a label contains the word \"to\"", () => {
    const architecture: Architecture = {
      nodes: [
        { id: "node-client", position: { x: 0, y: 0 }, data: { label: "Client" } },
        {
          id: "node-point-to-point-link",
          position: { x: 250, y: 0 },
          data: { label: "Point to Point Link" },
        },
      ],
      edges: [],
    };

    const result = parseCommand("connect Client to Point to Point Link", architecture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.architecture.edges[0]).toMatchObject({
      source: "node-client",
      target: "node-point-to-point-link",
    });
  });

  test("reports a missing node (not a missing edge) when remove edge references an unknown node", () => {
    const architecture: Architecture = {
      nodes: [
        { id: "node-web-server", position: { x: 0, y: 0 }, data: { label: "Web Server" } },
        { id: "node-database", position: { x: 250, y: 0 }, data: { label: "Database" } },
      ],
      edges: [
        { id: "edge-web-server-database", source: "node-web-server", target: "node-database" },
      ],
    };

    const result = parseCommand("remove edge Web Server to Databasee", architecture);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected remove edge to fail");
    expect(result.message).toBe('No node named "Databasee".');
  });

  test("reports unrecognized commands instead of silently doing nothing", () => {
    const result = parseCommand("do something weird", emptyArchitecture);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected an unrecognized-command failure");
    expect(result.message).toBe('Unrecognized command: "do something weird"');
  });

  test("trims whitespace-only input before echoing it back in the error", () => {
    const result = parseCommand("   ", emptyArchitecture);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected an unrecognized-command failure");
    expect(result.message).toBe('Unrecognized command: ""');
  });
});
