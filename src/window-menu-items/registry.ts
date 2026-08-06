/**
 * Third-party window-menu-item registry.
 *
 * Plugins append rows to the ⋯ actions menu in a matching window's
 * title bar — the surface the framework already uses for a window's
 * own infrequent verbs ("Open on startup", "Reload", "Open in browser
 * tab"). That is the right home for a *per-window preference*: a
 * setting that changes how this window behaves but doesn't earn
 * permanent real estate in the title bar or the window's own toolbar.
 *
 * Two shapes, matching the two the built-in items already use:
 *
 *   - **Action** — a one-shot verb. Clicking runs `onClick` and closes
 *     the menu.
 *   - **Checkbox** — `checkable: true` plus a `checked( win )` reader.
 *     Clicking flips the indicator optimistically, runs `onClick`, and
 *     leaves the menu open, so the user can see the new state without
 *     reopening it. `checked` is re-read every time the menu opens, so
 *     a value the plugin persists elsewhere (localStorage, REST) stays
 *     authoritative without the plugin having to repaint anything.
 *
 * The `match` predicate decides which windows carry the item; a menu
 * with no matching items looks exactly as it did before. Registering
 * or unregistering after a window is open triggers a repaint through
 * the subscriber list, so an item registered by a lazily-loaded
 * bundle appears in the already-open window that loaded it.
 *
 * @see {@link ../title-bar-buttons/registry} for the sibling registry
 * that paints persistent buttons rather than menu rows.
 */

import { throwOnRegistrationErrors } from '../registration-errors';
import { createSharedStore } from '../shared-store';

import type { Window as DesktopWindow } from '../window';

export interface WindowMenuItemDef {
	/**
	 * Unique id matching `/^[a-z0-9_/-]+$/` (lower-case alphanum +
	 * hyphen + underscore + slash). Slashes let plugin authors use
	 * the same `vendor/sub-id` namespacing convention as every other
	 * registry here. Re-registering the same id replaces the entry.
	 */
	id: string;
	/** Row text. Also used as the row's accessible name. */
	label: string;
	/**
	 * Optional Dashicons class (e.g. `'dashicons-visibility'`) painted
	 * at the row's leading edge. Ignored for checkable items —
	 * `<os-menu-item role="menuitemcheckbox">` spends that slot on the
	 * check indicator.
	 */
	icon?: string;
	/**
	 * Sort order among plugin items. Default 100. Plugin items always
	 * paint after the framework's built-in rows; `order` only sorts
	 * them against each other.
	 */
	order?: number;
	/**
	 * Render as a checkbox row rather than an action row. Pair with
	 * {@link checked} — a checkable item with no reader paints
	 * permanently unchecked.
	 */
	checkable?: boolean;
	/**
	 * Current check state for this window. Called on every menu open
	 * (and on every registry repaint), so it should be a cheap
	 * synchronous read of whatever the plugin treats as the source of
	 * truth. Only consulted when {@link checkable} is set.
	 */
	checked?: ( window: DesktopWindow ) => boolean;
	/**
	 * Predicate — return `true` to paint this row on this window.
	 * A window's own native-window id is the common case:
	 * `( w ) => ( w.config.baseId ?? w.id ) === 'my-plugin/thing'`.
	 */
	match: ( window: DesktopWindow ) => boolean;
	/**
	 * Invoked on selection. For checkable items the visible indicator
	 * has already been flipped optimistically when this runs — the
	 * handler's job is to persist the new state, and the next menu
	 * open re-reads {@link checked} to correct the row if the persist
	 * failed.
	 */
	onClick: ( window: DesktopWindow ) => void;
	/**
	 * Whether selecting the row closes the menu. Defaults to `true`
	 * for action rows and `false` for checkable rows (a toggle the
	 * user may want to flip twice shouldn't dismiss itself). Set
	 * explicitly to override either default.
	 */
	closeOnClick?: boolean;
	/**
	 * Owner tag — the WordPress script handle that registered the
	 * item. Set this when plugin deactivation should live-unregister
	 * the row. Mirrors commands, settings tabs, and title-bar buttons.
	 */
	owner?: string;
}

/**
 * Cross-bundle shared backing store. The lazy `window-system[.min].js`
 * bundle paints from this registry while main and feature bundles
 * write to it — each bundle would otherwise see its own empty copy.
 * See `AGENTS.md` ("Cross-bundle state").
 */
interface RegistryStore {
	registry: Map< string, WindowMenuItemDef >;
	listeners: Set< () => void >;
}
const store = createSharedStore< RegistryStore >(
	'desktop-mode/window-menu-items-registry',
	() => ( { registry: new Map(), listeners: new Set() } ),
);
const registry = store.state.registry;
const listeners = store.state.listeners;

/**
 * Pattern of valid window-menu-item ids — identical to the title-bar
 * button pattern so the two surfaces a plugin is most likely to use
 * together accept the same slug.
 *
 * @internal
 */
const WINDOW_MENU_ITEM_ID = /^[a-z0-9_/-]+$/;

/**
 * Register (or replace) a window menu item. Re-registering with the
 * same id replaces the previous entry — mirrors WordPress's
 * `register_*` semantics.
 *
 * Throws a {@link RegistrationError} when validation fails, so a
 * mistyped field surfaces as a stack frame at registration time
 * rather than as a menu row that silently never appears.
 *
 * @param  def Item definition.
 * @throws {RegistrationError} when `def` fails validation.
 */
export function registerWindowMenuItem( def: WindowMenuItemDef ): void {
	const errors: string[] = [];

	if ( ! def || typeof def !== 'object' ) {
		errors.push( 'def (not an object)' );
	} else {
		if ( typeof def.id !== 'string' || def.id.trim() === '' ) {
			errors.push( 'id (missing)' );
		} else if ( ! WINDOW_MENU_ITEM_ID.test( def.id.trim().toLowerCase() ) ) {
			errors.push(
				`id (must match ${ WINDOW_MENU_ITEM_ID } — lowercase alphanum, hyphens, underscores, slashes for vendor/sub-id)`,
			);
		}
		if ( typeof def.label !== 'string' || def.label.trim() === '' ) {
			errors.push( 'label (missing)' );
		}
		if ( typeof def.match !== 'function' ) {
			errors.push( 'match (must be a function)' );
		}
		if ( typeof def.onClick !== 'function' ) {
			errors.push( 'onClick (must be a function)' );
		}
		if ( def.checkable && typeof def.checked !== 'function' ) {
			errors.push( 'checked (required when checkable is set)' );
		}
	}

	throwOnRegistrationErrors( 'WindowMenuItem', errors, def );

	const id = def.id.trim().toLowerCase();
	registry.set( id, { ...def, id } );
	notify();
}

export function unregisterWindowMenuItem( id: string ): void {
	if ( registry.delete( id.toLowerCase() ) ) {
		notify();
	}
}

export function unregisterWindowMenuItemsByOwner( owner: string ): number {
	if ( ! owner ) {
		return 0;
	}
	let removed = 0;
	for ( const [ id, def ] of Array.from( registry.entries() ) ) {
		if ( def.owner === owner ) {
			registry.delete( id );
			removed++;
		}
	}
	if ( removed > 0 ) {
		notify();
	}
	return removed;
}

export function listWindowMenuItems(): WindowMenuItemDef[] {
	return Array.from( registry.values() ).sort(
		( a, b ) => ( a.order ?? 100 ) - ( b.order ?? 100 ),
	);
}

/**
 * Items that match a given window, in paint order. A `match` that
 * throws excludes the item rather than breaking the whole menu — one
 * plugin's bad predicate must not cost the user their "Reload" row.
 */
export function menuItemsForWindow(
	win: DesktopWindow,
): WindowMenuItemDef[] {
	const items: WindowMenuItemDef[] = [];
	for ( const def of listWindowMenuItems() ) {
		try {
			if ( ! def.match( win ) ) {
				continue;
			}
		} catch {
			continue;
		}
		items.push( def );
	}
	return items;
}

/** Subscribe to registry changes. Used by open windows to repaint. */
export function subscribeWindowMenuItems( cb: () => void ): () => void {
	listeners.add( cb );
	return () => {
		listeners.delete( cb );
	};
}

function notify(): void {
	const snapshot = Array.from( listeners );
	for ( const cb of snapshot ) {
		try {
			cb();
		} catch ( err ) {
			if ( typeof console !== 'undefined' ) {
				console.error(
					'[openstation] window-menu-item registry listener threw:',
					err,
				);
			}
		}
	}
}
