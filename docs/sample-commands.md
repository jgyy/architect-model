# Sample console commands

Type these into the console's `>` input (bottom-right Console panel), one at a time. `help`
prints the same command reference live in the app. Each section below assumes a fresh seeded
example (Internet → Web Server → Database) - click **Clear history** first if you've been
experimenting.

## Happy path

Extends the chain at both open ends - Web Server and Database already have their one
outgoing/incoming edge used, so new links go on Database's free outgoing side and Internet's free
incoming side:

```
add node Cache
connect Database to Cache
add node CDN
connect CDN to Internet
rename node Cache to Redis
move node Redis to step 2
remove edge Database to Redis
remove node CDN
undo
redo
export
```

## Alias variants

Same effects as the primary syntax, different phrasing:

```
create node Load Balancer
new node Queue
link Load Balancer and Queue
relabel node Queue to Message Queue
disconnect Load Balancer from Message Queue
delete node Message Queue
delete node Load Balancer
```

## Error cases

Run in order - each should fail with the inline message shown, leaving the architecture
unchanged:

```
connect Nonexistent to Database
remove node Nonexistent
remove edge Internet to Database
add node Web Server
connect Web Server to Web Server
connect Internet to Web Server
add node Cache
connect Web Server to Cache
connect Cache to Web Server
connect Database to Internet
rename node Cache to Database
```

| Command                            | Why it fails                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `connect Nonexistent to Database`  | No node named "Nonexistent".                                                                   |
| `remove node Nonexistent`          | No node named "Nonexistent".                                                                   |
| `remove edge Internet to Database` | No edge from "Internet" to "Database" - they aren't directly connected.                        |
| `add node Web Server`              | A node named "Web Server" already exists.                                                      |
| `connect Web Server to Web Server` | "Web Server" can't connect to itself.                                                          |
| `connect Internet to Web Server`   | An edge from "Internet" to "Web Server" already exists.                                        |
| `connect Web Server to Cache`      | "Web Server" already connects to "Database"; a node can have only one outgoing connection.     |
| `connect Cache to Web Server`      | "Web Server" is already reached from "Internet"; a node can have only one incoming connection. |
| `connect Database to Internet`     | Connecting "Database" to "Internet" would create a circular loop.                              |
| `rename node Cache to Database`    | A node named "Database" already exists.                                                        |

## Ambiguous reference

```
add node Server A
add node Server B
remove node Server
```

Type the last line, then press **Escape** before **Enter** - otherwise the live autocomplete
dropdown (it's showing "Server" as a partial match) completes the field to its first suggestion
on Enter instead of submitting the literal text. With the dropdown dismissed, it submits and is
rejected: `"Server" matches multiple nodes: "Web Server", "Server A", "Server B". Be more
specific.`

## Undo/redo edge cases

```
undo
undo
redo
redo
```

With nothing done yet, `undo` reports "Nothing to undo." (not an error/crash) and `redo` reports
"Nothing to redo." the same way.
