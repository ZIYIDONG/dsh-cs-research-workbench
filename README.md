**English** | [中文](README_zh.md)

# CS Research Workbench (dsh-cs-research-workbench)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness) [![](https://img.shields.io/badge/powered_by-CodeBuddy-4D6BFE?style=flat-square&logo=codebuddy&logoColor=white)](https://www.codebuddy.cn/)

**CS Research Workbench** (`dsh-cs-research-workbench`, `dsh-csrw` for short) is an **end-to-end research workbench for computer science**. It connects topic ideation, literature and notes, code and experiment versions, result archiving, and data backup into a single pipeline that runs entirely on your own machine.

The workbench has four tabs: **Todos (with a monitor console), Projects, Papers, Ideas · Knowledge base** (ideas and the knowledge base share one entry). Two further entries do not take a tab: the top-bar **Backup / Sync** dialog and the **CS Research Workbench** section in DSH settings. They deal with files and remotes and do not create research entries, so neither gets a tab of its own.

"End-to-end" means the five stages above. It does not include lab instrument control or submission-system integration: the plugin owns local files, versions, and backups, and does not replace domain-specific experiment tooling.

> An end-to-end research workbench for Computer Science: todos, papers, projects, ideas, knowledge base, sync and backup.

**Current version: `0.1.1-dev.0` (dev build).**

v0.1 ships in two layers: the **workbench UI** (local state, quick capture, assistant, undo) and the **execution layer** underneath it (Obsidian file operations, Git, the local read-only Zotero API, Nutstore WebDAV, verifiable backups). The plugin ID and CLI are `dsh-csrw`; all tools share the `dsh_csrw_` prefix (49 tools); the workspace config directory is `.dsh-csrw`; workbench state lives in `$DSH_HOME/dsh-csrw/state.json`.

## Four tabs and two non-page entries

| Entry | What it stores | Current status |
| --- | --- | --- |
| Todos `todo` | Task title, status, priority, due time, owning project | Available: scattered canvas, list, and calendar views; draggable and undoable |
| Projects `project` | The pace of the project itself | Placeholder page; only shows the record count |
| Papers `paper` | Bibliographic record, DOI/arXiv, reading status | Placeholder page; only shows the record count |
| Ideas · Knowledge base `idea`/`kb` | Ideas, hypotheses, questions, methods; concepts, pitfalls, formulas, tools, snippets, templates | Available: entry list on the left, Markdown editor/preview/split on the right; create, edit, delete; two-way sync with the vault |
| Sync and backup | Snapshots, remote copies | No page; lives in settings and in `dsh_csrw_nutstore_*` / `dsh_csrw_backup_*` |
| Settings page | Workbench preferences, workspace and session selection, Git/Zotero/WebDAV checks, Obsidian and cloud backup cards | Available; the "CS Research Workbench" section in DSH settings |

Placeholder pages are not empty shells: quick capture and the assistant can both write entries in all six categories. Projects and Papers simply count rows today, with no list or editing UI yet. Ideas and the knowledge base are editable in their merged page. Project and paper entries are still created through quick capture and read through the assistant.

Workbench data and the 49 tools are two independent states: the tools never read or write `$DSH_HOME/dsh-csrw/state.json`. When an entry must become a file, a version, or a remote copy, call the matching tool explicitly:

| Desired result | Tool to use |
| --- | --- |
| Bibliographic records and citations | `dsh_csrw_zotero_search` / `item` / `cite` |
| Notes and knowledge base into the vault | `dsh_csrw_obsidian_write` / `append` |
| Code and experiment versions | `dsh_csrw_git_status` / `commit` / `push` / `pull` |
| Directory sync to Nutstore | `dsh_csrw_nutstore_push` / `pull` / `delete` / `logs` |
| Verifiable local snapshots | `dsh_csrw_snapshot_create` / `verify` / `restore` |

## Requirements and installation

- Node.js ≥22.16; DSH `>=0.2.2-rc.1 <0.3.0`. Verification environment: Node 26.13.0, DSH 0.2.2-rc.1, Windows, Git 2.46.0.windows.1. Zotero SQLite online backup uses `backup()` from the built-in `node:sqlite`; a runtime without that API fails explicitly instead of degrading to copying a live database.
- The Git module needs a system `git`. If `git` is not on `PATH`, tests and tools fail explicitly — put Git on `PATH` first.
- Obsidian operations read and write the vault directly; no Obsidian REST plugin is required.
- Zotero needs a running local API, by default `http://127.0.0.1:23119/api`. When the API is unavailable the plugin fails explicitly and never falls back to the cloud.

Install dependencies in the source directory and verify:

```powershell
npm install --ignore-scripts
npm run check
npm run check:ui
npm test
node bin/dsh-csrw.js health
```

The `@deepseek-ai/*` packages in `devDependencies` are only peer dependencies needed to run tests locally; DSH provides them at runtime, and installing the plugin does not install them. Without npm, use the pnpm bundled with DSH: `node <dsh-runtime>/pnpm/bin/pnpm.mjs install --ignore-scripts`.

Install this directory or a published package through DSH plugin management. Have your agent call `plugin_manager`'s `install_bundle` with `target` set to the absolute package directory; do not hand-edit the profile. The package's `patches/bundle.yaml` only inserts its own plugin line. The `application` and `warnings` fields in the install result decide whether it took effect; if a version replacement needs a restart, restart and then verify with `dsh_csrw_health`. The Chinese/English display resources and the original SVG icon ship inside the package.

Run `node bin/dsh-csrw.js` directly from the source tree; after installing as a CLI package, `dsh-csrw` works too. Commands map one-to-one to tools — `dsh-csrw obsidian read` corresponds to `dsh_csrw_obsidian_read`. `--help` lists every command.

## Naming conventions

| Identifier | Value | Scope | Notes |
| --- | --- | --- | --- |
| npm package name | `dsh-cs-research-workbench` | npm / DSH module | Renaming requires reinstalling |
| Plugin name | `dsh-csrw` | Host plugin `name`, locale namespace, CLI | Stable; the tool prefix aligns with it |
| UI panel ID | `dsh-csrw-ui` | Main panel, sidebar entry, settings section, settings icon | All four must share this value |
| HTTP route | `/dsh-csrw/api` | Host web service | The frontend uses the relative base `dsh-csrw/api/` |
| Workbench state directory | `$DSH_HOME/dsh-csrw/` | Local persistence | Copied automatically from `csrw-desk/`; the old directory is kept |
| Workspace config | `<workspace>/.dsh-csrw/` | In-project config, sync state, backups | Reads of legacy `.csrw/` config are copied over automatically |
| Tool prefix | `dsh_csrw_` (49 tools) | Model tools | Tool names cannot contain hyphens, hence underscores |
| Human command | `/dsh-csrw` | DSH command palette | Same name as the CLI; it is not a model tool |

Every public identifier uses `dsh-csrw`: plugin name, CLI, command, config directory, remote root, credential key, and tool prefix all share the same root. The tool prefix replaces `-` with `_` because of naming rules. The point is to make clear that this is a DSH plugin, not a `csrw` application independent of DSH. `scripts/check-identifiers.mjs` enforces this consistency, and `npm run check` runs it.

## Graphical interface

After installing the plugin and refreshing the DSH page, the sidebar gains a **CS Research Workbench** entry whose main panel is the research home. Settings keeps a **CS Research Workbench** section with the same name, and the plugin management page also offers a config card. The main panel and the settings page share one native React client half (`client.js`, a hand-written IIFE with no build step); no separate web service is started.

Main panel (`/dsh-csrw/api/*` routes, data in `$DSH_HOME/dsh-csrw/state.json`; the legacy `csrw-desk/` directory is copied on first read and the old files are kept):

1. Top-bar navigation regrouped: **Monitor** sits leftmost, separated from the rest by a divider; then the four tabs — Todos, Projects, Papers, Ideas · Knowledge base (ideas and knowledge base merged into one entry). On the right are the assistant model button, the backup/sync button, and the assistant toggle (click to collapse or summon the right-hand assistant dock; the state persists in preferences).
2. First screen shows two rows of numbers: how many items are waiting for you, and how many papers are queued for this week; below them is a one-line capture box.
3. One-line input is routed by content: DOI/arXiv → papers; `Question:` / `Hypothesis:` / `Method:` / `Limitation:` or a link → ideas; a date, `@project`, `#P0`, or `~30min` → tasks; everything else → tasks.
4. The Todo page is a two-part frosted-glass layout (`20px` radius, `blur(24px)`, uniform opacity, `16px` spacing): the upper panel holds the todo overview plus input area (a scattered canvas of draggable cards, wheel to pan, `Ctrl/⌘ + wheel` to zoom; zoom/reset buttons bottom right; the one-line capture box centered), and the lower panel holds the five-category list (Todo: All / Projects / Paper / Idea / Knowledge base). Clicking a scattered card or a list row opens the edit dialog where fields can be changed or the entry deleted; the list panel scrolls internally and the quick-capture entry sits in its header; empty states are rendered per panel.
5. The merged Ideas · Knowledge base page is an Obsidian-like editor/reader: entry list on the left (create and select), Markdown editor on the right with edit/preview/split modes, rendering headings, lists, code blocks, bold, italics, links, and `[[wikilinks]]`; entries can be created, edited, and deleted in place. A Sync toolbar at the top lets you pick the ideas/knowledge-base directory and sync workbench entries with local Obsidian notes both ways (manual trigger, via `POST /api/vault-sync`); conflicts keep a `.conflict.md` copy and are never overwritten automatically.
6. Quick capture is split by type: task (priority, due date, project, status), paper (DOI, URL, reading status), idea (type: idea/hypothesis/question/method), knowledge base (concept/pitfall/formula/tool/snippet/template). Filling the form writes straight into local state.
7. The right-hand assistant dock: with no model selected it uses local rules (create a task, check today, count todos) and stays offline; once a model is chosen in the top bar, the assistant answers only from current workbench data, is asked to stay within 120 characters and never invent entries, and falls back to local rules on model failure while marking the `engine` in the response.
8. Workbench preferences (UI language, assistant dock expanded by default, clear sample data, undo hints) no longer occupy a top-bar entry; they all live in the **CS Research Workbench** section of DSH settings (see below).
9. Native 30-step undo (`Ctrl/⌘+Z`), Chinese and English copy, and narrow-screen adaptation (two columns below `<1020px`, one column below `<780px`, assistant collapsed by default on narrow screens).
10. Layout rules: all full-width content must sit inside `.rd-content`. When the assistant dock is expanded the content area yields `--dock-w` (336px), and the top bar and toasts keep clear of it too; do not use `position: fixed` or `100vw` to fill the width yourself or the assistant will cover it.
11. The monitor console is the default landing view of the home (Todos) page: it opens by default, showing in-progress/waiting/due-today tasks, paper reading progress (to read / close read / read / cited), project milestone progress, and a recent backup summary (via `GET /dsh-csrw/api/backups`). Clicking the Todo tab or the monitor button switches between monitor and todo list; every visit returns to the monitor.
12. Backup center: the top-bar Backup/Sync button opens a dialog (a session must be selected first as the permission context) with two pages. Operations: one-click backup, per-source backup (Obsidian / Zotero / DSH / workspace), upload to Nutstore, back up to GitHub, Nutstore connection check plus sync log, snapshot verification (enter a path) and pruning. Configuration: edit `backup.target/localDir/keep/mode/includeDshSessions/dshHome/dshProfile`, `nutstore.baseUrl/remoteRoot/username/credentialKey/retry/retryDelay`, and `git.backupRemote/backupBranch/backupRepoDir`, then save in bulk (via `dsh_csrw_config_set`). Base settings that should be set once and never change remain only in the DSH settings section.

Tool panel in the settings page (including workbench preferences):

1. A Preferences card at the top: UI language (Chinese/English), assistant dock expanded by default, clear sample data; it reads and writes workbench state directly, and a language change applies to the main panel immediately.
2. Pick a workspace directory and select an existing session from the list as the permission and audit context for commands; no model conversation is started.
3. Click "Load config" to read workspace defaults/config. Fields are saved one at a time, with strings and booleans validated against a whitelist. Passwords are never entered or stored in the UI.
4. The workbench can check Git, Zotero, and WebDAV, list remote directories, upload/download manually, create the three backup kinds, and verify snapshots. Sync and backup show the workspace and parameters first and run only after confirmation. Restore stays in tools that require explicit confirmation; there is no one-click restore.
5. The "Obsidian tools" card: backlinks/links/broken links/list/graph/bookmarks/Canvas (read-only) plus template/daily/attachment/rename (write with confirmation); the "Cloud backup" card: backup parameters/upload to Nutstore/back up to GitHub/one-click backup; the "Literature notes" card: generate a paper note from a Zotero key.
6. Switching the workspace clears the old config and results; execution can be cancelled at runtime, and success and failure are shown separately.

The UI invokes the existing tool definitions through the host's human command `/dsh-csrw`, reusing DSH's existing remote authorization and never bypassing the permission policy; the command does not record raw input. It is not a model tool and does not increase the `dsh_csrw_` tool count.

The command accepts two forms with identical boundaries (same READ/WRITE operation whitelist, same `--confirm` requirement, same absence of restore):

```text
/dsh-csrw help
/dsh-csrw config show --workspace C:\repo
/dsh-csrw nutstore list --workspace C:\repo --remote-path notes
/dsh-csrw config set --workspace C:\repo --key obsidian.vaultPath --value vault --confirm
/dsh-csrw backup obsidian --workspace C:\repo --confirm
```

The UI sends one line of JSON (`{"operation":"…","args":{…},"confirmed":true}`); typing by hand can use the `<module> <operation> --flag` form above. Both inputs land in the same execution function. GUI entry points never run sync, backup, init, or push implicitly. Workbench data is local state, independent of the 49 stateless tools; when you need it in Git or Nutstore, call `dsh_csrw_git_*` / `dsh_csrw_nutstore_*` explicitly.

During development, saving `client.js` triggers DSH client HMR automatically; changes under `lib/` (host code) require reloading the plugin or restarting DSH. The design document index is below.

## Design documents

`docs/` is organized by topic, and every document corresponds to shipped UI or execution-layer code:

| Document | Contents |
| --- | --- |
| `dsh-research-desk-design.md` | Overall: product positioning, page inventory, data model |
| `dsh-research-desk-home.md` | Home (monitor) layout, scattered cards, one-line capture |
| `dsh-research-desk-pages.md` | Per-page details, interactions, empty states (written before ideas and knowledge base merged; the two affected chapters defer to the merged editor/reader) |
| `obsidian-local-features.md` | Obsidian local capability list and implementation status (all 21 implemented) |
| `backup-architecture.md` | Backup system, manifest, and the local / Nutstore / GitHub split |
| `nutstore-sync-test-plan.md` | Manual test flow and acceptance criteria for Nutstore WebDAV sync |

## Configuration

The first read returns defaults and never writes config automatically. Config lives in the workspace at `.dsh-csrw/config.json`; `.dsh-csrw.example.json` is a complete copyable example. `dsh_csrw_config_set` sets one whitelisted field per call and rejects unknown fields, type mismatches, and password/token fields; `dsh_csrw_config_show` returns a redacted view. Structural violations in existing config (a WebDAV host outside the whitelist, a non-compliant `git.backupRemote` URL) are never silently accepted: they are listed one by one in `policyViolations`, while the same values are rejected outright on write.

```powershell
node bin/dsh-csrw.js config set --args '{"key":"obsidian.vaultPath","value":"vault"}'
node bin/dsh-csrw.js config show
```

Quoting of inline JSON in Windows PowerShell varies by version. You can also save arguments to a JSON file and use `--args-file params.json`. `--workspace` selects the workspace and defaults to the current session directory; the CLI uses the current working directory.

| Config | Default / behavior |
| --- | --- |
| `git.remote`, `git.branch` | `origin`, `main`; the remote URL is configured by Git itself |
| `git.autoInit`, `git.pullRebase` | `false`, `false` |
| `git.backupRemote`, `git.backupBranch`, `git.backupRepoDir` | empty, `backup`, `.dsh-csrw/backup-repo`; remote URL, branch, and local repo directory for GitHub metadata backups |
| `obsidian.vaultPath`, `obsidian.autoDetect` | empty path, `true`; auto-discovers `.obsidian` in the workspace and its direct subdirectories, and errors when several candidates exist |
| `obsidian.trashDir` | `.trash`, the trash directory relative to the vault |
| `obsidian.ideasDir`, `obsidian.notesDir` | `ideas`, `kb`, relative to the vault or absolute; targets for two-way sync between ideas/knowledge base and Obsidian |
| `zotero.localApi`, `zotero.dataDir` | default local API address, empty path; database backup requires an explicit data directory |
| `nutstore.baseUrl`, `nutstore.remoteRoot` | `https://dav.jianguoyun.com/dav/`, `dsh-csrw` |
| `nutstore.username`, `nutstore.credentialKey` | empty username, `dsh-csrw/nutstore`; the key is a reference, not a password |
| `backup.target`, `backup.localDir` | `local`, `.dsh-csrw/backups`; with `target=nutstore`, `backup_all` also uploads to Nutstore |
| `backup.keep`, `backup.mode` | `10`, `full`; keep the most recent N snapshots after creating one (`0` disables pruning); with `mode=incremental`, unchanged files are reused via hard links |
| `nutstore.retry`, `nutstore.retryDelay` | `2`, `1000`; retry count and backoff base for failed Nutstore requests (only network/5xx/429 are retried, never 4xx) |
| `backup.includeDshSessions` | `false`; sessions/storages are excluded by default |
| `backup.dshHome`, `backup.dshProfile` | empty paths; an explicit value is required when auto-discovery cannot be unique |

## Credentials

Nutstore uses a dedicated app password that never goes into project config, tool arguments, or logs. It is re-read on every operation:

1. An `api-key` record from DSH `credentials.readRecord(credentialKey)`: `key` holds the app password and `env.NUTSTORE_USERNAME` holds the username; or the username comes from non-secret config.
2. With no stored record, the `NUTSTORE_USERNAME` / `NUTSTORE_PASSWORD` environment variables are used. Environment variables only affect processes that inherit them, so a running DSH must be started from that environment.

The Zotero local API needs no API key. WebDAV enforces HTTPS (HTTP is allowed for local testing only), forbids usernames, passwords, query strings, and fragments inside the URL, and rejects redirects.

WebDAV endpoints have a host whitelist: only `https://dav.jianguoyun.com/dav/` is supported (loopback is allowed for tests only). **Self-hosted WebDAV endpoints (Nextcloud and the like) are not supported.**

## Tools and boundaries

| Group | Tools |
| --- | --- |
| Checks and config | `dsh_csrw_health`, `dsh_csrw_config_show`, `dsh_csrw_config_set` |
| Obsidian | `dsh_csrw_obsidian_search`, `read`, `write`, `append`, `move`, `trash`, `attributes`, `links`, `backlinks`, `list`, `template`, `daily`, `attach`, `rename`, `broken_links`, `graph`, `canvas`, `bookmarks` (every short name uses the `dsh_csrw_obsidian_` prefix) |
| Literature notes | `dsh_csrw_paper_to_note` (generate a vault paper note from a Zotero item) |
| Git | `dsh_csrw_git_status`, `init`, `commit`, `push`, `pull` (every short name uses the `dsh_csrw_git_` prefix) |
| Zotero | `dsh_csrw_zotero_search`, `item`, `notes`, `attachments`, `cite` (every short name uses the `dsh_csrw_zotero_` prefix) |
| Nutstore | `dsh_csrw_nutstore_test`, `list`, `push`, `pull` (every short name uses the `dsh_csrw_nutstore_` prefix) |
| Backup and snapshots | `dsh_csrw_backup_obsidian`, `dsh_csrw_backup_zotero`, `dsh_csrw_backup_dsh`, `dsh_csrw_backup_workspace`, `dsh_csrw_snapshot_create`, `dsh_csrw_snapshot_verify`, `dsh_csrw_snapshot_restore`, `dsh_csrw_snapshot_prune`, `dsh_csrw_backup_upload`, `dsh_csrw_backup_github`, `dsh_csrw_backup_all` |

The model-visible parameter descriptions on each tool and the CLI `--help` output are the concrete call interfaces. Every operation returns a single JSON payload; infrastructure errors are thrown rather than wrapped as success. Tools honor cancellation signals.

### Obsidian

Paths are relative to the vault; `..`, drive escapes, symlinks, and directory junctions are rejected. `write` refuses to overwrite by default and only replaces an existing file with `overwrite:true`; `append` requires an existing note and appends the text verbatim. `move` does not overwrite the target and **does not rewrite `[[wikilinks]]`** (use `rename` when links must follow). `trash` only moves a file into the vault trash directory and returns a recoverable path; it never deletes permanently. Search skips internal directories and trashed content. `attributes` reads or updates a note's frontmatter (`title`/`tags`/`aliases` and other YAML keys): omitting `set` makes it read-only, keys whose value is `null` in `set` are deleted, and `keys` returns only the requested keys.

Links and retrieval (matching the capability list in `docs/obsidian-local-features.md`, all implemented):

- `search` filters by `tag` / `scope` (directory) / `property` (`key=value`); `query` may be empty to list notes by filter alone.
- `links` resolves a single note's outgoing `[[wikilinks]]` (aliases, block references, embeds, explicit paths) and disambiguates them to real file paths.
- `backlinks` finds every note linking to the target (embeds excluded) and reports body mentions that are not links yet.
- `rename` moves the file and rewrites links to it across the vault; alias references stay unchanged and still resolve to the file.
- `broken_links` finds links pointing at missing files and reports ambiguous same-name candidates.
- `graph` exports graph nodes/edges (it computes, it does not draw).
- `list` lists Markdown files under a directory with optional content reads; `template` renders a template with `{{key}}` variables (built-ins `date`/`time`/`title`); `daily` creates a daily note following `.obsidian/daily-notes.json`; `attach` copies local images/PDFs into the vault attachment directory; `canvas` reads and writes `.canvas` JSON; `bookmarks` read-only flattens `.obsidian/bookmarks.json`.

`paper_to_note` generates a vault paper note from a local Zotero item (frontmatter + `[[cite:KEY]]` + abstract + `![[attachment]]` reference) and never downloads attachments. Link resolution tries an exact path first, then the shortest unique basename path, then aliases; ties on same-name files are marked `ambiguous` instead of silently picking one. The index is scanned in memory on demand, which is enough for a single call on a small or medium vault (hundreds of notes).

```json
{"path":"notes/example.md","text":"# Example\nResearch notes\n"}
```

Save the payload to a parameter file and run `dsh-csrw obsidian write --args-file params.json`; reading uses `{"path":"notes/example.md"}`.

### Git

Git runs through argument arrays, never through a shell. Initialization is idempotent and adds local ignore rules; `git.autoInit=true` only lets an explicit commit initialize the repository after validating every path, while status queries stay read-only; commits never push implicitly. Push/pull require a configured remote; pulling onto a dirty tree is refused by default, and the rebase strategy can be configured explicitly. Credentials are managed by the SSH agent or the Git credential helper; the plugin never stores Git passwords. An actual push modifies the remote repository and should only be called within the user's authorization.

Remote URLs are validated in two tiers:

- `git.backupRemote` (for backups): only `https://`, `ssh://`, or scp form (`git@host:path`).
- Your own repositories (the `git.remote` used by `git.push` / `git.pull`): the above plus local bare repositories — `file://` (local machine), drive-letter absolute paths (`C:\bare.git`), and UNC share paths (`\\server\share\repo.git`).
- Both tiers always reject: remote-helper syntax such as `ext::` / `fd::`, `http://`, `git://`, embedded passwords, relative paths, and addresses starting with `-`.

Local remotes involve neither network nor credentials and have no remote-helper command execution, so they are allowed only for your own repositories; backup remotes keep the strict tier. Non-compliant addresses are rejected at write time, and existing values show up in `dsh_csrw_config_show`'s `policyViolations`.

### Zotero

Only GET requests against the local API. Search, item, notes, attachment metadata, and citation tools never write to Zotero, never download attachments, and never fall back to the cloud. Returned citations follow the API's actual metadata and do not replace checking each reference by hand.

### Nutstore

`push` / `pull` take `localPath` (a local directory) and an optional `remotePath` (a directory relative to the configured `remoteRoot`). Baselines are tracked by SHA-256 and identical files are skipped. Overwriting the remote requires a conditional ETag request, using `If-None-Match: *` for the first write and re-reading for verification after upload.

When a mismatch cannot be resolved safely, `.local` and `.remote` copies are kept and reported in the JSON `conflicts` array instead of silently replacing files; existing conflict copies get a unique suffix. **Deletes are not propagated and there is no background or scheduled sync.** Local state lives in `.dsh-csrw/sync/`. Single files and responses are capped at 32 MiB and directory listings at 10000 entries; large attachments are out of scope for this version. Directory sync ignores `.git`, `.dsh-csrw`, `node_modules`, and common credential files.

### Backup, verification, and restore

Backups are local by default; the manifest records version, time, size, and a per-file SHA-256. Zotero SQLite is copied consistently through a read-only source connection plus SQLite online backup, avoiding a raw copy of a live database. That online backup uses `backup()` from the built-in `node:sqlite`; a runtime without it fails explicitly rather than degrading to copying a live database. DSH backups cover the prompts, plugins, skills, soul (expert team), and configuration that are actually discovered or explicitly configured, excluding sessions/storages by default; known sensitive paths and files whose content looks sensitive are skipped entirely (whole files, not field-level redaction). They include `cordis.patch.yml`, package manifests, and the pnpm lockfile if a profile is included, while excluding `node_modules` and `.git` — dependencies must be rebuilt from the manifests. Sensitive detection is a conservative heuristic and cannot guarantee 100% recall of unknown key formats; review the exclusion report before uploading. The fourth source, `workspace`, backs up the workspace `.dsh-csrw/config.json` and sync baselines, excluding the backup directory itself.

Restore requires an explicit `confirm:true`, verifies the manifest and every file first, and automatically takes a pre-restore snapshot. It restores only files listed in the manifest and never deletes extra content at the destination; it never performs an unauthorized real restore of user data. Multi-file restore is not a filesystem transaction: runtime I/O, cancellation, or concurrent changes can leave it partially complete, and the pre-restore snapshot is the rollback reference. SHA-256 provides integrity, not provenance, and does not offer full TOCTOU protection against hostile concurrency. Close Zotero before restoring SQLite; restore is refused while an active WAL/SHM exists. Large files are read into memory. Verify backup content and the credential exclusion report in a separate directory first.

Cloud division of labor (see `docs/backup-architecture.md`): local is always the primary backup; `dsh_csrw_backup_upload` incrementally syncs the full snapshot directory to Nutstore (large attachments, SQLite, everything), while `dsh_csrw_backup_github` commits the workspace config and snapshot manifests to a private GitHub repository (small files, versioned). `dsh_csrw_backup_all` takes a local snapshot in one step and fans out according to `backup.target` and `git.backupRemote`; a failing step does not block the others. Neither propagates deletes nor syncs on a schedule; GitHub push requires an explicit `confirm`.

Backup strategy: full snapshots by default (per-file SHA-256 plus a manifest); with `backup.mode=incremental`, unchanged files are hard-linked to save disk space (files inside an incremental snapshot share inodes with other snapshots, so do not edit snapshot directories by hand). After creating a snapshot, the most recent N are kept per `backup.keep` (`dsh_csrw_snapshot_prune` can also prune manually); only snapshot directories containing a `manifest.json` are deleted, while `.pending-*` and corrupted directories are left alone. The sync direction is fixed: local primary → remote copy. Nutstore push/pull is incremental by SHA-256 and keeps both `.local`/`.remote` copies on conflict instead of overwriting; network errors, timeouts, and 5xx/429 retry with exponential backoff per `nutstore.retry`, while authentication failures, 404, 412, and similar business errors fail immediately without retrying.

Nutstore capabilities (full test flow in `docs/nutstore-sync-test-plan.md`): `nutstore_test` returns connection status, latency, and actionable hints (classified as authentication failure / permission / network / path); `nutstore_delete` deletes a remote file or directory after explicit confirmation (refusing to delete the remote root, treating 404 as already gone); `nutstore_push` with `prune=true + confirm=true` can delete extra remote files; every sync appends to `.dsh-csrw/logs/nutstore.log`, and `nutstore_logs` returns recent records. Credentials come only from the DSH credential store (api-key) or the `NUTSTORE_USERNAME` / `NUTSTORE_PASSWORD` environment variables, never from the UI.

### Migrating from older versions

Workbench state moved from the legacy `$DSH_HOME/csrw-desk/state.json` to `$DSH_HOME/dsh-csrw/state.json`. The migration happens automatically on first read: it is skipped when the target already exists, a parse failure in the legacy file fails explicitly and keeps the original file, and the write is exclusive and leaves a `.migrated-from-csrw-desk` marker on success. **The old directory is never deleted**; clean it up yourself once the new directory works.

Three legacy names are also supported, all read-only fallbacks that never delete old data:

1. Workspace config: when the new `.dsh-csrw/config.json` is missing, the legacy `.csrw/config.json` is read and best-effort copied to the new path.
2. Credentials: when no record exists for `dsh-csrw/nutstore`, the legacy key `csrw/nutstore` is used.
3. Remote directory: the default `remoteRoot` changed from `csrw` to `dsh-csrw`, and old remote content is not migrated automatically. To keep historical syncs, rename the directory on the WebDAV side yourself, or `dsh_csrw_nutstore_pull` to the local machine first and push again.

The CLI executable was renamed from `csrw` to `dsh-csrw`, model tools from `csrw_*` to `dsh_csrw_*`, and the command from `/csrw-ui` to `/dsh-csrw`, which now accepts both JSON and the `dsh-csrw <module> <operation>` form. These are breaking renames within 0.1.0: existing call scripts, shortcuts, and prompts must be updated.

### Troubleshooting the workbench API

When the page reports a load failure, first confirm outside the browser whether the route exists at all:

```text
GET /dsh-csrw/api/state
  404 + empty body          → route not registered; the plugin's web half is not mounted (host loaded tools but not routes)
  401 + {"error":"unauthorized"} → route is fine, the request just lacks a session credential; click "Load config" in the UI
```

Routes are mounted through conditional injection with `ctx.inject(['webServer'], …)`: the `webServer` service may become ready later than this plugin, and a one-shot
`ctx.get('webServer')` permanently misses it in that startup order, which looks like every tool working while the workbench returns 404 forever.
In environments without a web GUI (CLI, unit tests) the conditional injection never fires, and the 49 tools and the `/dsh-csrw` command are unaffected.

## Verification and scope

Automated tests use isolated fixtures under the workspace `.test-artifacts/` or the system temp directory plus local mock services; they never push to real external repositories or restore a real vault, Zotero library, or DSH profile. Run `npm test` for current results. Real Zotero search/read acceptance requires a running local service; a real Nutstore round trip requires your own app password and a test directory. Mocks cannot substitute for these.

The UI in this version covers the three todo views, the ideas/knowledge-base editor/reader, and the Projects and Papers placeholder pages; it does not include an MCP server, vector retrieval, clustering, Zotero writes, scheduled sync, or permanent deletion. Obsidian wikilinks (resolution, disambiguation, backlinks, unlinked mentions, rewriting), search filters, templates, daily notes, attachment copies, broken-link detection, graph data, Canvas, and bookmarks are all implemented (see `docs/obsidian-local-features.md`).

## Source layout

`lib/index.js` registers tools and workbench routes; `lib/tools/` implements the modules (`obsidian.js` for Obsidian tools, `paper.js` for literature notes, `git.js`, `zotero.js`, `nutstore.js`, `backup.js`, `config.js`); `lib/desk/` is the workbench host half (`host.js` routes, `store.js` persistence/undo/migration, `ops.js` operation whitelist, `seed.js` sample data, `ids.js` global identifiers); `lib/services/config.js` manages configuration and `lib/services/snapshot.js` manages backups; `lib/utils/` provides path boundaries, frontmatter parsing, the wikilink engine (`path.js`, `frontmatter.js`, `wikilink.js`), and hashing helpers. `bin/dsh-csrw.js` is the CLI; `client.js` is the browser half; `patches/bundle.yaml` is the DSH bundle patch; `docs/` holds the workbench design documents; `scripts/check.mjs` and `scripts/check-identifiers.mjs` run structural and identifier consistency checks, and `scripts/verify-ui*.mjs` verify UI registration and interaction. GPL-3.0-only License (keeping the upstream GNU GPL v3 grant).

### Acceptance record (2026-11-12)

- `npm run check` passed: syntax, package metadata, 49 `dsh_csrw_` tools, and all six modules `ready`; `identifiers` passed (`dsh-csrw-ui`, `/dsh-csrw/api`, `dsh-csrw`).
- `npm run check:ui` passed: five UI registrations, icon geometry, titles, settings section id, and both language strings all matched.
- `npm test`: all 88 cases passed (0 skipped, 0 failed). Of these, 5 cover `lib/desk/`, 2 cover workbench state migration, 2 cover config compatibility; 12 are new Obsidian wikilink/search/template/daily/attachment/rename/broken-link/graph/Canvas/bookmark cases; 2 are `paper_to_note` cases (verifying Zotero request paths and generated content against a local mock HTTP server); 3 are new cloud backup cases; 4 are new vault sync cases (pull creates, push writes back, conflicts keep a copy, knowledge-base `kb` field); 4 are new Nutstore cases (error classification, delete confirmation, root protection, missing log). The "real Git temporary repository integration" case needs a process that can capture subprocess output through pipes; it is skipped by design in sandboxes that restrict that capability and passes in a normal terminal. A later run on 2026-11-13, after the retention, incremental-snapshot, sensitive-exclusion, remote-URL, retry and Nutstore-error suites landed, reported 151 cases passing with 0 failures and 0 skipped.
- Runtime checks: `GET /dsh-csrw/api/state` returned 401 (route registered, authorization required) and the legacy `GET /csrw-desk/state` returned 404; the client slot list showed `sidebar.panellist` (order 45), `settings.section` (order 17), and `settings.section.icon` all as `dsh-csrw-ui`; `dsh_csrw_health` reported 49 tools with all six modules `ready`.
- State migration verified on a real machine: copied from `~/.dsh/csrw-desk/` to `~/.dsh/dsh-csrw/` and read 6 todos, 3 papers, and 3 ideas; the legacy file's SHA-256 was identical before and after (never rewritten), and the new directory contained `state.json` plus the `.migrated-from-csrw-desk` marker.
- Manual UI acceptance: the settings section, sidebar entry, titles, and icon names displayed as expected, and loading config in the workbench worked; the plugin card description (41 characters) was not truncated.
- External service boundaries: Zotero was not running locally, so real API search/item reads were not accepted; no Nutstore app password was provided, so a real remote round trip was not accepted. Both return explicit errors rather than fake success when unavailable. Obsidian-side acceptance used a temporary vault (never real user data): write/append/move/trash worked, `../` escapes and default overwrite were rejected, `snapshot_verify` detected tampered files, and `snapshot_restore` refused without `confirm: true`.
- Not yet implemented: the Projects and Papers pages only hold counts, with no list or editing UI (ideas and the knowledge base are merged into an editor/reader with an entry list, Markdown edit/preview/split, and two-way Obsidian sync — this is the workbench UI layer and unrelated to the Obsidian execution layer). The Obsidian local capability list (`docs/obsidian-local-features.md`) is fully implemented.