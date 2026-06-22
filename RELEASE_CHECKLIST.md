# Release checklist

This checklist describes how to cut a release of `sof-mssql`. It encodes the
project [constitution](.claude/CLAUDE.md) quality gates and the conventions used
by previous releases.

A release is published to two places automatically:

- The npm registry, as the [`sof-mssql`](https://www.npmjs.com/package/sof-mssql)
  package.
- GitHub Pages, as the conformance test report.

Both are driven by the `Publish to npm` workflow
([`.github/workflows/publish.yml`](.github/workflows/publish.yml)), which runs
when a GitHub Release is **published**.

## How the release pipeline works

Publishing a GitHub Release triggers three jobs in sequence:

1. **Build and test** - across a matrix of SQL Server `2017-latest`,
   `2019-latest` and `2022-latest`. Runs `npm run build`, `npm run lint`,
   `npm run format:check`, then the conformance test suite against each engine.
2. **Publish to npm** - runs after the test job, builds, and runs `npm publish`.
   Authentication uses npm OIDC trusted publishing (the `npm` environment), not
   a stored token.
3. **Publish test report to GitHub Pages** - deploys the conformance report.

Two steps are deliberately non-blocking and are the source of the most common
release mistakes:

- The **test** step uses `continue-on-error: true`. A red test suite will **not**
  fail the workflow, so it will **not** stop the npm publish. A green workflow
  does not prove the tests passed.
- The **`npm publish`** step also uses `continue-on-error: true`. If the version
  already exists on npm, or auth fails, the workflow stays green but nothing is
  published.

The practical consequence: the human gates below (verifying tests locally, and
verifying the published artefact afterwards) are the real quality controls. CI
will not catch a failed release for you.

Note that `npm publish` reads the version from `package.json`, not from the git
tag. The version bump must be part of the commit the release tag points at.

## One-time setup (already configured)

These are recorded for reference; they should already be in place.

- [ ] The `SA_PASSWORD` repository secret exists (used to start SQL Server in
      CI).
- [ ] npm trusted publishing (OIDC) is configured for `sof-mssql` against this
      repository and the `npm` GitHub environment.
- [ ] GitHub Pages is enabled for the repository with the GitHub Actions source.

## 1. Pre-flight: prove the codebase is releasable

Run from a clean checkout of `main`, with the database environment sourced. All
gates below are non-negotiable per the constitution.

- [ ] Working tree is clean and `main` is up to date with `origin/main`.
- [ ] The `sqlonfhir` submodule is checked out at the intended commit
      (`git submodule status`). Conformance is measured against this revision.
- [ ] Clean build: `npm run build`.
- [ ] Lint passes with no errors or warnings: `npm run lint`.
- [ ] Formatting is clean: `npm run format:check`.
- [ ] Full test suite with coverage passes, with the environment sourced:

  ```bash
  set -a && source .env && set +a && npm run test:coverage
  ```

- [ ] **All in-scope (non-`#experimental`) conformance tests pass.** This is the
      Principle I gate. Because CI runs tests with `continue-on-error`, this is
      verified here, locally, and nowhere else. If anything in-scope fails, the
      release does not proceed.
- [ ] Generated SQL has been exercised against a real SQL Server instance (the
      test suite does this; Principle II).
- [ ] `README.md` and any other docs reflect the behaviour being shipped.

## 2. Choose the version number

Use [semantic versioning](https://semver.org/). Tags are `vMAJOR.MINOR.PATCH`.
Past releases follow this discipline:

- **Patch** (`v1.0.0` -> `v1.0.1`): backwards-compatible bug fixes only.
- **Minor** (`v2.0.0` -> `v2.1.0`): backwards-compatible new features (e.g. the
  `repeat` directive).
- **Major** (`v1.0.1` -> `v2.0.0`): breaking changes (e.g. changed default
  column type mappings). Anything flagged as a breaking change forces a major
  bump.

- [ ] Version number decided and agreed.

## 3. Bump the version

- [ ] Update `version` in [`package.json`](package.json) to the new number
      (without the `v` prefix, e.g. `2.3.0`).
- [ ] Commit the bump on its own, in imperative mood:

  ```bash
  git commit -m "Bump version to X.Y.Z" package.json
  ```

- [ ] Push to `main` (or merge via PR) so the release tag will point at a commit
      that already contains the bump.

## 4. Draft the release notes

Follow the structure used by previous releases. Use sentence case headings and
include only the sections that apply:

- `## New features` - user-facing additions, with short examples where helpful.
- `## Improvements` - non-breaking enhancements.
- `## Breaking changes` - prefix with ⚠️ and describe the migration impact.
- `## Changes` - for smaller releases, a short bulleted summary.

Conventions:

- Reference merged pull requests by number, e.g. `(#9)`.
- Cite the relevant section of the
  [SQL on FHIR v2 specification](https://sql-on-fhir.org/ig/2.0.0/) for new
  conformance behaviour.
- End with a compare link:
  `**Full changelog:** https://github.com/aehrc/sof-mssql/compare/vPREV...vNEW`.

- [ ] Release notes drafted and reviewed.

## 5. Create and push the release tag

Create the tag explicitly, as its own step, before the release exists. The
release in the next step is then attached to this pre-existing tag rather than
having a tag created for it from a moving branch. This guarantees the published
artefact corresponds to exactly the commit that was tagged, even if `main`
advances in between.

Use an annotated tag (it records the tagger, date and a message) on the commit
that contains the version bump - the tip of `main` pushed in step 3.

- [ ] Confirm `main` is pushed and the bump commit is its tip:

  ```bash
  git fetch origin
  git log --oneline -1 origin/main   # should be "Bump version to X.Y.Z"
  ```

- [ ] Create the annotated tag at that commit and push it (requires explicit
      approval to run a write operation):

  ```bash
  git tag -a vX.Y.Z -m "Release vX.Y.Z"
  git push origin vX.Y.Z
  ```

- [ ] Confirm the tag is on the remote and points at the bump commit:

  ```bash
  git ls-remote --tags origin vX.Y.Z
  ```

## 6. Publish the GitHub Release

Attach the release to the tag pushed in step 5. Do not use `--target`: that
would ask GitHub to create a tag, which is exactly what step 5 already did
deliberately. Passing `--verify-tag` makes the command abort if the tag does not
already exist on the remote, enforcing that every release points at a real,
pre-pushed tag.

- [ ] Create the release against the existing tag (requires explicit approval to
      run a write operation):

  ```bash
  gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --notes-file notes.md
  ```

  Or create it through the GitHub web UI by selecting the existing `vX.Y.Z` tag
  (do not let the UI create a new tag). Leave "Set as latest release" enabled for
  a normal release; tick "pre-release" only for a pre-release.

- [ ] Confirm the release is attached to tag `vX.Y.Z` and that the tag matches
      the `package.json` version.

## 7. Monitor the workflow

- [ ] The `Publish to npm` workflow run starts for the published release.
- [ ] The **Build and test** matrix jobs succeed. Open the run and confirm the
      conformance results are as expected - a green job alone is not sufficient
      because tests are non-blocking.
- [ ] The **Publish to npm** job succeeds **and** its `npm publish` step log
      shows the package was actually published (not skipped or errored - that
      step is non-blocking).
- [ ] The **Publish test report to GitHub Pages** job succeeds.

## 8. Post-release verification

- [ ] The new version is live on npm:

  ```bash
  npm view sof-mssql version
  ```

- [ ] A clean install resolves and the CLI runs:

  ```bash
  npx -y sof-mssql@X.Y.Z --help
  ```

- [ ] The GitHub Release page shows the correct notes and is marked as latest
      (if applicable).
- [ ] The GitHub Pages conformance report has updated.

## If something goes wrong

- **Workflow green but nothing on npm.** Expected when `npm publish` failed
  silently (version already exists, or auth). Inspect the `npm publish` step log.
  npm versions are immutable and cannot be overwritten - to ship a fix, bump to a
  new version (e.g. a patch) and release again.
- **A bad version was published.** Do not attempt to overwrite it. Publish a new
  patch release with the fix. Use `npm deprecate sof-mssql@X.Y.Z "reason"` to
  steer users away from the bad version if necessary.
- **In-scope tests were red at release time.** Treat as a defect against
  Principle I: ship a corrective release promptly and add a regression test
  first (Principle III).
