# Window menu items — rows in a window's ⋯ menu

Every window's title bar carries a **⋯ actions menu**: "Open on startup", "Reload", "Open in browser tab", and friends. `wp.os.registerWindowMenuItem()` lets a plugin append its own rows to that menu on the windows it chooses.

Reach for it when the thing you want to offer is a **per-window preference** or an infrequent verb — something that changes how this window behaves but isn't worth a permanent button. If the user will hit it often, use [`registerTitleBarButton`](../javascript-reference.md#registertitlebarbutton-def--experimental) instead: a button costs one click, a menu row costs two.

Full field reference: [`docs/javascript-reference.md`](../javascript-reference.md#registerwindowmenuitem-def--experimental).

---

## Recipe 1 — A checkable preference

The shape the built-in **Corkboard** uses for its "Show pins" toggle. Persist in `onClick`, read in `checked`, repaint nothing:

```js
wp.os.ready( () => {
    const KEY = 'my-plugin/compact-rows';
    let compact = localStorage.getItem( KEY ) === '1';

    wp.os.registerWindowMenuItem( {
        id:        'my-plugin/compact-rows',
        label:     'Compact rows',
        checkable: true,
        checked:   () => compact,
        match:     ( w ) => ( w.config.baseId ?? w.id ) === 'my-plugin/reports',
        onClick:   ( w ) => {
            compact = ! compact;
            localStorage.setItem( KEY, compact ? '1' : '0' );
            w.element.classList.toggle( 'is-compact', compact );
        },
    } );
} );
```

Two things the framework does for you here:

- **The indicator flips before your handler runs.** The user gets instant feedback and the menu stays open, so a preference they want to try twice doesn't dismiss itself.
- **`checked()` is re-read on every menu open.** If your write failed, or another window changed the same preference, the row corrects itself the next time it's shown. You never have to ask for a repaint.

## Recipe 2 — A one-shot action

Action rows close the menu and take an icon (checkable rows spend that slot on the check indicator):

```js
wp.os.registerWindowMenuItem( {
    id:      'my-plugin/export-csv',
    label:   'Export as CSV…',
    icon:    'dashicons-download',
    order:   20,
    match:   ( w ) => ( w.config.baseId ?? w.id ) === 'my-plugin/reports',
    onClick: ( w ) => downloadCsvFor( w.id ),
} );
```

## Recipe 3 — A row on every iframe window

`match` is just a predicate against the live `Window`, so "all windows of a kind" is as easy as one window:

```js
wp.os.registerWindowMenuItem( {
    id:      'my-plugin/copy-url',
    label:   'Copy this page’s URL',
    icon:    'dashicons-admin-links',
    match:   ( w ) => ! w.config.native,
    onClick: ( w ) => navigator.clipboard.writeText( w.getCurrentUrl() ),
} );
```

A `match` that throws excludes only that row — one plugin's bad predicate never costs the user someone else's rows, or the built-in ones.

---

## Matching a native window

Windows opened more than once get suffixed ids, so match on `baseId` and fall back to `id`:

```js
match: ( w ) => ( w.config.baseId ?? w.id ) === 'my-plugin/reports',
```

## Registering late

Registering after the window is open is the normal case for a native-window bundle — the bundle is lazy-loaded *by* the window opening. The registry's repaint fan-out puts the row into the already-open menu, so there's nothing to schedule and nothing to wait for. Register at module top level and let `match` decide where the row lands.

## Cleanup on deactivation

Set `owner` to your script handle. Rows owned by a handle registered through `openstation_register_titlebar_button_script()` are swept when that plugin deactivates, alongside its title-bar buttons:

```php
openstation_register_titlebar_button_script( 'my-plugin-chrome' );
```

```js
wp.os.registerWindowMenuItem( {
    id:      'my-plugin/export-csv',
    /* … */
    owner:   'my-plugin-chrome',
} );
```

Rows registered from a different bundle survive until the next page load — same graceful backwards-compat the command and settings-tab registries have.

---

## See also

- [Window controls](./window-controls.md) — the close/minimize/maximize cluster (Layer 2 chrome).
- [Window slots](./window-slot.md) — replace the icon, the title, or add banners around the title bar (Layer 3).
- [Window lifecycle](./window-lifecycle.md) — reacting to open / focus / close.
