# shadcn UI Standard

This repository uses one shadcn configuration across `apps/web` and
`packages/ui`.

## Standard

- Registry: official `@shadcn` registry only unless a task explicitly approves another registry.
- Style: `base-lyra`.
- Primitive base: Base UI.
- Framework: TanStack Start with React, not Next App Router conventions.
- CSS: Tailwind CSS v4 with CSS variables in `packages/ui/src/styles/globals.css`.
- Icons: `lucide-react`.
- Font: `@fontsource-variable/inter`, exposed through the `font-sans` theme token.
- Theme: neutral semantic tokens from `packages/ui/src/styles/globals.css`.
- Radius: the existing `--radius` token and generated radius scale.
- Component location: shared primitives in `packages/ui/src/components`; app-specific compositions in `apps/web/src/components`.

## Import Rules

- Import shared UI components through `@dindin/ui/components/<component>`.
- Do not add Radix UI, React Aria, or another primitive implementation for a component already provided by Base UI.
- Use Base UI's `render` composition API for shared components. Do not introduce Radix `asChild` patterns into Base UI components.
- Keep app-specific components out of `packages/ui` unless they are reusable primitives.
- Use the existing semantic tokens such as `bg-background`, `bg-card`, `text-muted-foreground`, and `border-border` instead of raw colors.
- Use the existing components before adding custom markup for cards, tables, navigation, dialogs, forms, and empty states.

## Adding Components

Run the CLI against the shared UI package and preserve the existing base:

```bash
bunx --bun shadcn@latest add <component> -c packages/ui
```

Before adding a component:

1. Run `bunx --bun shadcn@latest info -c packages/ui --json` and confirm `base-lyra`, `base`, Tailwind v4, and Lucide.
2. Check whether the component already exists in `packages/ui/src/components`.
3. Use only the official `@shadcn` registry unless another registry is explicitly approved.
4. Review generated imports and replace any Radix, React Aria, or Next-specific paths.
5. Run `bun x ultracite fix` on affected files and `bun run check`.
6. Run `bun run build` and verify the component in the browser when it affects layout or interaction.

## Current Exceptions

- `@shadcn/react/message-scroller` powers the existing message-scroller component. It is retained as a specialized package and is not a second general-purpose primitive base.
- `@dnd-kit`, Recharts, and TanStack Table support the dashboard compositions; they are not UI primitive replacements.
