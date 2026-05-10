# Lathe — Pitch Guide

---

## One-Line Pitch

> "Lathe is npm for MCP servers. Every website is one paste away from being a tool your AI agent can use."

---

## The Problem (say this first — judges need to feel the pain)

Right now, if you want Claude to read Hacker News jobs, you need to:
- Find or build an MCP server for that site
- Write the scraping logic yourself
- Host it somewhere
- Manually configure Claude Desktop

That's hours of work — for **every single website**.

There are millions of websites. Nobody is building MCP servers for all of them. So AI agents are blind to most of the web.

---

## What Lathe Does

1. You paste a URL
2. Lathe scrapes it via Anakin, infers the data schema, and generates a live MCP server
3. You get a one-line install snippet
4. Claude Desktop connects to it immediately — no code, no hosting, no terminal

**The difference:** Most tools generate *code you have to run yourself*. Lathe generates a **live hosted endpoint**. The install is one JSON snippet. Done.

---

## How It's Different

| Other approaches | Lathe |
|---|---|
| Gives you Python code to run yourself | Gives you a URL Claude connects to right now |
| One website at a time, manually | Registry of 50+ servers, pre-built and searchable |
| You maintain the server | Lathe hosts it — works forever |
| Developers only | Anyone can install in 30 seconds |

---

## The Anakin Angle (name every feature as it lights up)

Walk through the pipeline live. Each badge that lights up is an Anakin feature:

| Badge | What it means | Anakin feature used |
|---|---|---|
| **Wire ⚡** | Site already in Anakin's catalog — server ready in 2 seconds | Wire pre-built actions |
| **Map** | Anakin discovers all URLs on the site | `/v1/crawl` |
| **Headless** | Site uses JavaScript — Anakin spins up a real browser automatically | `useBrowser: true` |
| **AI Merge** | Multiple pages had conflicting schemas — merged with OpenAI | Schema inference |
| **Agentic** | Input was a topic, not a URL — Anakin searched the web | `/v1/agentic-search` |

You are not just using Anakin as a scraper. You are using **Wire, Crawl, headless fallback, schema inference, and Agentic Search** — the full platform.

---

## Demo Script (90 seconds)

### Beat 1 — The problem (0–15s)
*"Every agent developer hits the same wall: there's no MCP server for the site they need. Building one takes hours. We fix that."*

Paste `news.ycombinator.com/jobs` → hit Generate.

### Beat 2 — The pipeline (15–35s)
Watch badges light up: **Wire ⚡ → Map → Headless → Published ✓**

*"Anakin maps the site, crawls it with a headless browser, infers the schema — all automatically. Our server is live."*

### Beat 3 — The install (35–50s)
Copy the install snippet. Open Claude Desktop config, paste it, restart.

*"That's the install. One JSON snippet."*

### Beat 4 — It works (50–65s)
Ask Claude: *"Any Rust jobs on HN this week?"*

Claude calls the MCP server, returns structured results.

*"Claude just read a live website through an API that didn't exist 60 seconds ago."*

### Beat 5 — The registry (65–80s)
Open `/registry`. Show 50+ servers already there.

*"Every card here is one paste away from being in your agent. Wire alone gives us 50+ pre-built servers on day one."*

### Beat 6 — The vision (80–90s)
*"There are 1.1 billion websites. Zero of them have MCP servers today. Lathe changes that — any developer, any website, 60 seconds. This is npm for the agent web."*

---

## The Showstopper Moment

The **Wire hit** is your best moment. If the demo URL triggers a Wire action, the server is ready in ~2 seconds with no scraping at all. Say:

> *"It already knew this site. Anakin's Wire catalog had a pre-built action for it. Server created instantly — no crawling, no inference, just done."*

Lead with a Wire-supported URL if you can find one in the catalog. Fall back to HN jobs for the crawl path demo.

---

## Impact Statement (close with this)

> *"There are 1.1 billion websites. Zero of them have MCP servers today. Lathe closes that gap — any website, any agent, 60 seconds."*

---

## Judges' Likely Questions

**"How is this different from just writing a scraper?"**
A scraper is code you run. This is a live hosted endpoint anyone can install in 30 seconds. No code, no maintenance, shareable via the registry.

**"What happens when a website changes its structure?"**
Regenerate — one click. The pipeline re-crawls and updates the schema automatically.

**"Why would someone use this over an existing MCP server?"**
Most websites don't have MCP servers. Lathe covers the long tail — the niche forum, the internal wiki, the regional news site nobody has built for.

**"How does Anakin make this better?"**
Without Anakin, you'd need to write scraping logic per site, handle JS rendering yourself, manage proxies, and do schema inference from scratch. Anakin gives us all of that in one API call — Wire pre-builts, headless browser fallback, structured JSON output, and proxy rotation. We go from idea to live MCP server because Anakin handles the hard parts.
