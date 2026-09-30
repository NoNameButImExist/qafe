# Modules

One folder per module: `core`, `catalog`, `ordering`, `billing`, `audit`, `reporting` (added from phase 3).

Rules (enforced by ESLint, `boundaries` plugin):

- A module may import another module only through that module's `index.ts` (its public interface).
- Everything else inside a module folder is private to it.
- Shared types and event schemas live in `@qafe/contracts`.
- Each module uses its own DB schema and DB role (`svc_<module>`).
