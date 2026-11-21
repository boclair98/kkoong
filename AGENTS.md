# AGENTS.md

<!-- openui:start -->
## Mandatory OpenUI workflow

When a task asks for any of the following, use the `openui` skill before editing implementation files:
- landing page
- homepage
- marketing page
- hero page
- design concept page
- multiple landing-page variants
- high-concept page generation

## Required process

1. Before generating page code, create or replace `/design.md` at the repository root.
2. `design.md` is mandatory and is the source of truth for implementation.
3. Never leave unresolved placeholders such as `[Topic]` or `[Offer]` inside `design.md`.
4. If the user omitted inputs, resolve them first and write concrete values into `design.md`.
5. If the user explicitly fixed an input, preserve it.
6. If the user asked for multiple variants:
   - create one section per variant in `design.md`
   - resolve inputs independently for each variant
   - do not copy one variant's input set into another
   - a variant is invalid if it differs only by palette, copy polish, spacing, or superficial decoration
   - each variant must represent a materially different concept direction
   - each variant must define a distinct composition contract, not only distinct copy
7. After `design.md` is written, implement the page variants one by one in the same order they appear in `design.md`.
8. For four or more variants, implement and inspect variants in batches of at most three before continuing.
9. Do not invent proof assets, fake metrics, fake testimonials, fake logos, or fake screenshots.
10. Keep support highlights in one lower support cluster only.
11. Do not use cardified hero layouts, floating sub-surfaces, or generic SaaS dashboard patterns unless the topic explicitly requires that artifact.
12. Before final response, compare all variants together and revise any that feel weaker, repetitive, or merely reskinned.

## Multi-Variant Quality Gates

For four or more variants:

- Add a composition contract for every variant in `design.md`: hero archetype, first-viewport structure, primary visual/proof artifact, interaction behavior, and reuse boundary.
- Work in implementation batches of at most three variants.
- Before each batch, reread the relevant `design.md` sections.
- After each batch, visually inspect desktop and mobile screenshots for every route in the batch before continuing.
- Shared CSS, JS, components, or templates are allowed only for infrastructure such as resets, routing, navigation, basic accessibility helpers, and small utilities.
- Do not implement a large multi-variant request as one generic data-driven page renderer unless each variant still has a custom hero composition, custom visual/proof artifact, and custom interaction behavior.
- Do not let later variants become "same layout plus different copy."
- Ensure the first viewport shows the dominant hero and a hint of the next section on common desktop and mobile sizes unless the user explicitly requests a full-screen hero.

Final comparative gate:

- Review all variants side by side or in a fast route sweep.
- Confirm each variant has a distinct first impression, composition, visual/proof artifact, and interaction behavior.
- Revise later variants if they have degraded into thinner versions of earlier variants.

## Implementation policy

- For a single HTML deliverable, prefer `index.html`.
- For multiple HTML variants, prefer:
  - `variants/variant-01/index.html`
  - `variants/variant-02/index.html`
  - `variants/variant-03/index.html`
- For a single React deliverable, prefer one component file in the existing project structure.
- For multiple React variants, create one component per variant with clear naming.

Do not start implementation until `design.md` is complete.
<!-- openui:end -->
