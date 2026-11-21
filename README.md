# Java Prep

A small, local LeetCode-style app for Java interview practice.
No accounts and no external judge: questions live in a single SQLite file, `data/java-prep.db` (no database server to install),
and your code is compiled and run on your own machine with `javac` / `java`.

- **Question list** with search, a difficulty filter and tag filters (click a tag to filter; pick several to narrow down)
- **Add / edit / delete questions**: title, tags (e.g. `stream`, `lambda`, `string`), Markdown description, method signature, 3 to 4 (or more) test cases
- **Split view**: description on the left, Java editor on the right, test results below
- You write only the method inside `class Solution`, like on LeetCode
- **Run** (or Ctrl/⌘ + Enter) shows pass/fail per test case with your output, the expected output, `System.out` prints, and compile/runtime errors with line numbers
- Your code for each question is kept in the browser while you work (Reset restores the starter code)

## Requirements

- **JDK 17 or newer** (`javac -version` should work in a terminal, or set `JAVA_HOME`)
- **Node.js 20 or newer**

## Run it

```bash
npm install      # first time only
npm run dev
```

Open http://localhost:3000.

For a faster, non-dev server: `npm run build && npm start`.

## Adding a question

Click **+ Add question** and fill in:

| Field | Example |
|---|---|
| Method name | `twoSum` |
| Return type | `int[]` |
| Parameters | `int[] nums`, `int target` |
| Test case inputs (JSON, one box per parameter) | `[2,7,11,15]` and `9` |
| Expected (JSON) | `[0,1]` |

Supported types: `int`, `long`, `double`, `boolean`, `char`, `String`, `ListNode`, `TreeNode`,
arrays (`int[]`, `char[][]`, `String[]`, ...) and lists (`List<Integer>`, `List<List<String>>`, ...).

- Linked lists are written as arrays: `[1,2,3]`.
- Trees are level-order arrays with `null` for missing children: `[3,9,20,null,null,15,7]`.
- `char` values are 1-character strings: `"a"`.
- Return type `void` is for in-place problems (e.g. Rotate Array): the first parameter is checked after your method runs.
- **Answer comparison** can be *exact*, *any order* (top-level list) or *any order nested* (e.g. Group Anagrams). Doubles are compared with a 1e-5 tolerance.

`java.util.*`, `java.util.stream.*`, `java.util.function.*` and `java.math.*` are imported for you.
`ListNode` and `TreeNode` are provided with the usual LeetCode fields (`val`, `next`, `left`, `right`).

## Hosting it on a server (VPS)

The app runs your Java code, so **never put it on the internet without a password.**

1. Install Node.js 20+, a JDK 21, and Docker (for the sandbox).
2. Copy the project to the server, then:
   ```bash
   cp .env.example .env.local      # then fill in the values
   docker pull eclipse-temurin:21-jdk
   npm ci && npm run build
   npm start -- -p 3000            # or run it with systemd / pm2
   ```
3. Put it behind HTTPS, e.g. with Caddy: `your-domain.com { reverse_proxy localhost:3000 }`.
4. Keep `data/` on persistent disk and back it up; `data/java-prep.db` holds all your questions.
   To keep the data outside the project folder (handy when you redeploy), set `DATA_DIR=/var/lib/java-prep`.
   Safe backup while the app is running (WAL mode, so don't just copy the file mid-write):
   ```bash
   sqlite3 data/java-prep.db ".backup 'backup-$(date +%F).db'"
   # or, without the sqlite3 tool: a JSON export of every question
   curl -H "Authorization: Bearer $API_TOKEN" https://your-domain.com/api/problems > questions-backup.json
   ```
   A nightly cron job running one of these is plenty.

Settings (environment variables, see `.env.example`):

| Variable | What it does |
|---|---|
| `APP_PASSWORD` | Every page and API call requires signing in with this password (30-day cookie). |
| `API_TOKEN` | Lets scripts call the API with `Authorization: Bearer <token>`, no sign-in needed. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `D1_DATABASE_ID` | Store questions in Cloudflare D1 instead of the local file (see Storage below). |
| `DATA_DIR` | Folder for the local SQLite file. Defaults to `data/` in the project. |
| `JAVA_SANDBOX=docker` | Runs each submission in a throwaway container: no network, read-only filesystem, 512 MB memory, 1 CPU, 256 processes, unprivileged user. The user running the app must be allowed to use Docker. Adds about a second per run. |

## REST API

With `API_TOKEN` set, anything that can make HTTP requests (a script, or Claude) can manage questions.

| Method | Path | |
|---|---|---|
| `GET` | `/api/problems` | List all questions |
| `GET` | `/api/problems/{id}` | One question |
| `POST` | `/api/problems` | Add a question (returns it with its new `id`) |
| `PUT` | `/api/problems/{id}` | Replace a question |
| `DELETE` | `/api/problems/{id}` | Delete a question |
| `POST` | `/api/run` | Run code: `{"problemId": "...", "code": "class Solution { ... }"}` |

Add a question:

```bash
curl -X POST https://your-domain.com/api/problems \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Count Vowels",
    "difficulty": "Easy",
    "tags": ["string", "stream"],
    "description": "Return how many vowels (a, e, i, o, u, any case) are in `s`.",
    "functionName": "countVowels",
    "returnType": "int",
    "params": [{ "name": "s", "type": "String" }],
    "compare": "exact",
    "testCases": [
      { "args": ["\"hello\""], "expected": "2" },
      { "args": ["\"xyz\""],   "expected": "0" },
      { "args": ["\"AEIOU\""], "expected": "5" }
    ]
  }'
```

Field notes:
- `difficulty`: `Easy`, `Medium` or `Hard`. `tags`: an array or a comma-separated string.
- `compare`: `exact`, `anyOrder` or `anyOrderNested`.
- Each test case has one entry in `args` per parameter. **Every value is a JSON string**, so a Java String
  `"hello"` is written `"\"hello\""`, an array is `"[1,2,3]"`, a number is `"9"`.
- Invalid questions are rejected with `400` and a list of readable `errors`.

## Storage

Questions live in a SQLite database. You can keep it in one of two places:

**Local file (default).** `data/java-prep.db`, created on first start, no setup. Handles tens of thousands of questions.
Back it up with `sqlite3 data/java-prep.db ".backup 'backup.db'"`.

**Cloudflare D1.** The app keeps running on your server and reads/writes questions in D1 through
Cloudflare's HTTP API. Your data then lives (and is backed up) on Cloudflare, so the server holds nothing you can lose.

1. Create an API token: dash.cloudflare.com, My Profile, API Tokens, Create Token, Custom token, permission **Account / D1 / Edit**.
2. Set these in `.env.local` (or your service manager), never in git:
   ```
   CLOUDFLARE_ACCOUNT_ID=<your account id>
   CLOUDFLARE_API_TOKEN=<the token>
   D1_DATABASE_ID=8e9f0a7e-c744-4e3f-b7ae-c9e21c928c3f
   ```
3. Restart the app. On first start it creates the tables in D1 and copies your existing questions in
   (from `data/java-prep.db` if it exists, otherwise from `data/problems.json`). The log says which storage it uses.

Each database call is an HTTPS request to Cloudflare, so pages take a little longer (typically 50 to 200 ms per call).
D1 keeps 30 days of point-in-time recovery (Time Travel); see `wrangler d1 time-travel`.

The very first start (local or D1) imports `data/problems.json` once; after that the JSON file is no longer read.

## How it works

```
data/java-prep.db         your questions (SQLite; created on first start)
data/problems.json        starter questions, imported once when the database is first created
src/app/page.tsx          question list
src/app/problems/...      split-view workspace and the add/edit form
src/app/api/problems      read/write questions
src/app/api/run           compile + run your code
src/lib/javaRunner.ts     generates a Main.java harness for the test cases, runs javac/java, compares results
src/lib/javaTypes.ts      Java type parsing, starter code, test-case validation
```

Each run writes `Solution.java` plus a generated `Main.java` into a temp folder, compiles them,
runs all test cases in one JVM (10 s limit), and deletes the folder.
The code runs with your user's permissions, so this is meant for local use only; don't expose it to the internet.
