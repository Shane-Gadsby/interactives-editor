# AI agents (MCP)
Let an AI agent join your editing session to build, change and debug alongside you.

An AI agent can join a project like another person: it shows in the top bar as **<name> (AI)**, its edits appear for everyone as it makes them, and it can see what you have selected, so you can say "make the selected button pulse when hovered".

It connects to this editor's **MCP server** over the network. There is nothing to download or install: any MCP client that can use an HTTP server (Claude Code, Claude Desktop and others) only needs the address below.

## A first conversation
1. Open a project in the editor, so you can watch.
2. Add the MCP server to your agent (below).
3. Ask the agent: *List my projects, then join the one called Lamp.* A person called **<name> (AI)** appears in the top bar.
4. Select a layer yourself, then ask: *Make the selected button pulse when I hover over it.* The agent reads your selection and makes the change while you watch.
5. Ask it to run **validate** when it is done, to find broken references and expressions that don't parse.

## Setting it up
The MCP server for this editor is at:

```
https://<your server>/interactives/mcp?agent=Claude
```

In **Claude Code**, run:

```
claude mcp add --transport http interactives "https://<your server>/interactives/mcp?agent=Claude" --header "X-Session-ID: <your session id>"
```

For a client set up with a JSON file (Claude Desktop and most others):

```
{
  "mcpServers": {
    "interactives": {
      "type": "http",
      "url": "https://<your server>/interactives/mcp?agent=Claude",
      "headers": { "X-Session-ID": "<your session id>" }
    }
  }
}
```

Use the **Copy** button on each box.

> **<your session id>** is your StudyDesk sign-in. Open this page from the editor while signed in and it is filled in for you. Without one the agent sees what a signed-out visitor sees, which on most servers is nothing.

| Part | Meaning |
|---|---|
| `?agent=Claude` | The name people see in the top bar, as **Claude (AI)**. Change it to anything (up to 40 letters) |
| `X-Session-ID` | Who the agent works as. It can only open the projects that session can open. `Authorization: Bearer <session id>` works too |

## What the agent can do
| Tool | Does |
|---|---|
| list_projects | Your projects |
| create_project, list_starters | Make a new project, blank (with the Light, Dark and High contrast themes) or from a built-in starter or a saved template, and join it. The branded starter packs are made in the editor; an agent gives a blank project their look with a colourway |
| join_session | Joins a project's live session; reports who is there and what they have selected |
| leave_session | Leaves the session |
| who_am_i | Who the agent is working for: the name of the person whose session it holds, whether they can change the project, and the page and layers they have open. Only the name and what they can do, never an email or an id number |
| get_selection | The layers each person has selected, in full, the person the agent is working for first |
| get_overview, get_layers, get_interactions, get_variables | Read pages, layer trees, timelines, variables, interactions, and the themes with every colour token |
| export_project | The whole project document, or one part of it (its settings, themes, styles...) |
| edit | Add, change, copy, move and delete layers (a whole tree at once); add pages, variables, timelines, interactions and scripts, and change interactions in place; add themes, colourways, colour tokens and text styles; add data sources; change project settings. All in one batch |
| upload_asset | Add a picture, sound or data file to the project |
| list_notes, add_note, add_graph_note, edit_note, remove_note | Read and leave sticky notes |
| validate | Find broken references, colours that follow a missing token, layers lost far off the page, unconnected events and expressions that don't parse |
| read_reference | These help pages, plus generated references for layer fields, interaction nodes, animatable properties, colour values and how some runtime behaviour works |

Layers an agent adds follow the project's starter colours, the same as yours, so they look right in Dark and High contrast. It can name things the way you do, a colour token as **color/primary** or a variable by its name, and the project stores them the way the editor does.

## Staying in control
- Everything the agent does goes through the same live editing as people, so you watch it happen.
- Your **Undo** only undoes your own changes. To roll back an agent's work, use the [revision history](live-editing#revision-history) (a snapshot is kept every few minutes while the project changes). A snapshot that has an agent's changes in it says so, for example **Autosave (edited with Claude (AI))**, so you can find the version from before it started. **Save a named version…** there first is the surest way back.
- The agent can only open projects its session can open.
- An agent that goes quiet for two hours is disconnected and leaves any project it was in. Its client reconnects by itself the next time it is used.
- The people who run the server can switch agent access off altogether. Then connecting says **AI agent access is turned off on this server**, and that is not something you can change from the editor.
- Every tool an agent runs is written to the project's audit log (who, which agent, which tool), which power users can read. An agent that sends a great many requests in a minute is asked to wait (**Too many requests**) and can carry on after that.
