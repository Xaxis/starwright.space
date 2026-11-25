# Starwright

**Every technology and plan for the climb to Type I and Type II.** An open builder for moving
humanity up the Kardashev scale: what it must be able to do in every area, what already exists to
build on, and an invention for every gap, each with the experiment that would prove it and the path
from the bench to civilization scale. Every rung, capability and invention can be explored in 3D.

Read it at **[starwright-kappa.vercel.app](https://starwright-kappa.vercel.app)** (starwright.space once the domain is registered).

## What makes it useful

- **It builds on what exists.** Every capability cites the programmes, companies, records and papers
  already working toward it, with links, so nothing is reinvented.
- **It invents what is missing, and says how to prove it.** Feasibility is not a filter. Where
  nothing closes a gap, Starwright proposes a specific invention with the principle it works on, a
  first experiment (setup, what to measure, what counts as success, cost, months) and the steps from
  there to civilization scale. Every invention is labelled untested until its experiment runs.
- **Every number is reproducible.** Measured inputs live in [`data/constants.yaml`](data/constants.yaml)
  with their sources and quotes, chosen ones in [`data/assumptions.yaml`](data/assumptions.yaml) with
  their reasons, and [`core/src/model.ts`](core/src/model.ts) derives the rest. Prose never types a
  number by hand.
- **You can change the plan.** The [Builder](https://starwright-kappa.vercel.app/builder) reruns the model in
  your browser as you move any choice, and the link keeps your variant.

## Run it

You need Node 24 and pnpm 10.

```sh
pnpm install
pnpm model                     # the ladder: each rung's power and year, and what limits each era
pnpm model --only year-type-1  # one number: value, formula, inputs
pnpm check:data                # parse and cross-check everything in data/
pnpm dev                       # the site, on http://localhost:4527
pnpm lint && pnpm test
```

## Take part

Run a first experiment and report what you measured. Point out work we missed or a source that is
wrong. Propose an invention for a gap, or a better path for one of ours. Open an
[issue](https://github.com/Xaxis/starwright.space/issues) or a pull request: each record is one YAML
file under [`data/`](data/), and `pnpm check:data` says what a change breaks.

## Licence

Code is MIT; data and text are CC BY 4.0. See [LICENSE](LICENSE). What came from Phosphoros is in
[UPSTREAM.md](UPSTREAM.md).
