Add a small starter template library so users can start a canvas from a pre-built diagram instead of building from scratch.

## Implementation

1. Create `components/editor/starter-templates.ts`.

   Include:
   - a `CanvasTemplate` type
   - a `CANVAS_TEMPLATES` array
   - at least three templates, such as microservices, CI/CD pipeline, and event-driven system

   Each template should include:
   - `id`
   - `name`
   - `description`
   - nodes
   - edges

   Use the shared canvas types and existing node color palette. Add small helper functions if needed to keep the template data readable.

2. Create `components/editor/starter-templates-modal.tsx`.

   The modal should:
   - open as a dialog
   - show template cards in a scrollable grid
   - show the template name and description
   - include an import button for each template
   - call `onImport` with the selected template, then close

3. Add a simple diagram preview to each template card.
   - fit the preview to a fixed-size viewport
   - calculate the preview bounds from the template node positions
   - draw edges as simple lines between node centers
   - draw nodes using their shape and color data
   - keep the preview lightweight, no React Flow instance needed

4. Wire starter templates into the editor.
   - add a navbar button to open the starter templates modal
   - on an empty canvas, import the selected template directly (replace mode)
   - when the canvas already has content, present a choice instead of silently clearing it:
     - **Replace** — clear all existing nodes and edges, then add the template (the original spec-18 behavior)
     - **Add to project** — remap the template's node and edge IDs so they can't collide with existing ones, offset the template into free space next to the existing content, then fit everything
     - **New project** — create a fresh project and import the template into its empty canvas (the create dialog opens with the template attached; after the project is created, the import runs automatically)
   - fit the view after the template is loaded, in every mode
   - keep this inside the existing collaborative canvas state

   Correction note (2026-10-31, current-issues item 7): this item originally required an unconditional clear on import. Sarah confirmed that was a spec error — the replace / add / new-project choice above is the intended behavior.

## Scope Limits

- don’t add template saving yet
- don’t add custom user templates
- don’t add server persistence
- don’t change node or edge rendering behavior
- keep this focused on importing predefined templates

## Check When Done

- Template data is defined using shared canvas types.
- Import modal renders template cards with previews.
- Import on an empty canvas replaces the canvas content through the existing node and edge state flow; import on a populated canvas presents the replace / add / new-project choice.
- Editor navbar includes the import entry point.
- `npm run build` passes.
