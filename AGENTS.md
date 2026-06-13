<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:package-manager-rules -->
# Package Manager: Bun

This project uses **Bun** as its package manager. Do NOT use npm or yarn commands.

- Install dependencies: `bun install`
- Add a package: `bun add <package>`
- Add a dev dependency: `bun add -d <package>`
- Remove a package: `bun remove <package>`
- Run scripts: `bun run <script>` (e.g. `bun run dev`, `bun run build`)
- The lockfile is `bun.lock` (text) or `bun.lockb` (binary) — do NOT commit `package-lock.json` or `yarn.lock`
<!-- END:package-manager-rules -->
