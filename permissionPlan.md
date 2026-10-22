It's mostly set up already. The workflow I pushed deploys every push to testing to the testing Worker, and
  every push to main to production. All that's missing is Cloudflare access and a few GitHub settings.

  Which branch is production? Your first spec said main, and that's how it's built now. If you'd rather have a
  branch literally named production, I can switch the workflow and create that branch. It's a small change, so
  just tell me.

  Step 1: Create a Cloudflare API token

  Go to Cloudflare dashboard → My Profile → API Tokens → Create Token → Create Custom Token.

  Permissions (all at the Account level):

  ┌─────────────────────────┬────────┬──────────────────────────────────────────┐
  │       Permission        │ Access │                Needed for                │
  ├─────────────────────────┼────────┼──────────────────────────────────────────┤
  │ Workers Scripts         │ Edit   │ Deploying the Worker and Durable Objects │
  ├─────────────────────────┼────────┼──────────────────────────────────────────┤
  │ D1                      │ Edit   │ The database and migrations              │
  ├─────────────────────────┼────────┼──────────────────────────────────────────┤
  │ Workers KV Storage      │ Edit   │ KV namespaces                            │
  ├─────────────────────────┼────────┼──────────────────────────────────────────┤
  │ Account Settings        │ Read   │ wrangler needs this to find your account │
  ├─────────────────────────┼────────┼──────────────────────────────────────────┤
  │ Calls (Realtime / TURN) │ Edit   │ Optional: the TURN key for voice chat    │
  └─────────────────────────┴────────┴──────────────────────────────────────────┘

  - Account resources: include only your account.
  - Zone permissions: none for now. You'd only add Zone → Workers Routes: Edit later, if you put the site on a
    custom domain you own.
  - TTL: set an expiry date. It's good practice.

  Also copy your Account ID. It's in the right sidebar of the dashboard's Workers & Pages page.

  Step 2: Give me the token safely

  Please don't paste it into the chat, because then it stays in the conversation log. Instead, create the file
  C:\Users\dishant.totade\Videos\epic-board-game\.env.cloudflare with:

  CLOUDFLARE_API_TOKEN=your-token-here
  CLOUDFLARE_ACCOUNT_ID=your-account-id-here

  .gitignore already excludes .env.*, so this file can never be committed. I'll load it from there and never
  print it.

  Step 3: What I'll set up in Cloudflare once the file exists

  1. Create two D1 databases: epic-board-games (production) and epic-board-games-testing.
  2. Create two KV namespaces, one for production and one for testing.
  3. Put the real IDs into wrangler.jsonc, replacing the placeholders.
  4. Apply the database schema to both databases.
  5. Optional: create a TURN key and save it as encrypted Worker secrets in both environments, so voice chat
     works on strict networks.
  6. Do the first deploy of both Workers by hand to confirm they work:
     - https://epic-board-games-testing.<your-subdomain>.workers.dev
     - https://epic-board-games.<your-subdomain>.workers.dev
  7. Smoke-test both live sites (health check, signup, a game), then commit the config to testing.

  If your account has never used Workers, first open Workers & Pages once in the dashboard and pick a
  workers.dev subdomain. Cloudflare asks for this the first time.

  Step 4: Settings you set up in GitHub

  I can't change GitHub settings from here, because the GitHub CLI isn't installed and I have no GitHub token.
  These take about 5 minutes in github.com/Dishant221/epic-board-games → Settings:

  1. Secrets and variables → Actions → New repository secret:
     - CLOUDFLARE_API_TOKEN: I recommend a second token with the same permissions, just for GitHub. Then you
       can revoke the one you give me without breaking deploys.
     - CLOUDFLARE_ACCOUNT_ID
  2. Environments → New environment, twice:
     - testing: add the variable SITE_URL = https://epic-board-games-testing.<subdomain>.workers.dev
     - production: add the variable SITE_URL = https://epic-board-games.<subdomain>.workers.dev. Also tick
       Required reviewers and add yourself, so nothing reaches production without your click.
  3. Branches → Add branch ruleset for main:
     - Require a pull request before merging.
     - Require status checks to pass (choose the CI checks after their first run).
     - Block force pushes.

  How it works afterwards

  git push to testing ─► tests + typecheck + Rust build ─► DB migrations ─► testing Worker
  open PR testing → main ─► CI runs on the PR
  merge to main ─► same checks ─► you approve ─► DB migrations ─► production Worker

  Create .env.cloudflare and tell me "done", plus whether you want main or a branch named production, and I'll
  set up everything in Step 3.