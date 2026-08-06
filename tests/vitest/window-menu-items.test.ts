/**
 * Tests for the window-menu-item registry.
 *
 * Verifies validation rules (including the checkable/checked pairing
 * that has no analogue in the title-bar registry), predicate
 * filtering, `order` sorting, owner-scoped unregistration, and
 * subscriber notification.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	registerWindowMenuItem,
	unregisterWindowMenuItem,
	unregisterWindowMenuItemsByOwner,
	listWindowMenuItems,
	menuItemsForWindow,
	subscribeWindowMenuItems,
} from '../../src/window-menu-items/registry';
import type { Window as DesktopWindow } from '../../src/window';

function fakeWindow(
	id: string,
	overrides: Partial< DesktopWindow > = {},
): DesktopWindow {
	return {
		id,
		config: { id, native: true, title: id },
		...overrides,
	} as unknown as DesktopWindow;
}

const ACTION = {
	label: 'Do the thing',
	match: () => true,
	onClick: () => void 0,
};

describe( 'window-menu-items registry', () => {
	beforeEach( () => {
		for ( const def of listWindowMenuItems() ) {
			unregisterWindowMenuItem( def.id );
		}
	} );

	afterEach( () => {
		for ( const def of listWindowMenuItems() ) {
			unregisterWindowMenuItem( def.id );
		}
	} );

	test( 'registers an action item', () => {
		registerWindowMenuItem( { id: 'a', ...ACTION } );
		expect( listWindowMenuItems() ).toHaveLength( 1 );
	} );

	test( 'accepts the vendor/sub-id namespacing convention', () => {
		registerWindowMenuItem( { id: 'my-plugin/node-style', ...ACTION } );
		expect( listWindowMenuItems().map( ( i ) => i.id ) ).toContain(
			'my-plugin/node-style',
		);
	} );

	test( 'lower-cases the id on register', () => {
		registerWindowMenuItem( { id: 'MiXeD', ...ACTION } );
		expect( listWindowMenuItems()[ 0 ].id ).toBe( 'mixed' );
	} );

	test( 're-registering the same id replaces the entry', () => {
		registerWindowMenuItem( { id: 'a', ...ACTION, label: 'First' } );
		registerWindowMenuItem( { id: 'a', ...ACTION, label: 'Second' } );
		expect( listWindowMenuItems() ).toHaveLength( 1 );
		expect( listWindowMenuItems()[ 0 ].label ).toBe( 'Second' );
	} );

	test.each( [
		[ 'missing id', { ...ACTION } ],
		[ 'bad id', { id: 'Has Spaces', ...ACTION } ],
		[ 'missing label', { id: 'a', match: () => true, onClick: () => void 0 } ],
		[ 'missing match', { id: 'a', label: 'A', onClick: () => void 0 } ],
		[ 'missing onClick', { id: 'a', label: 'A', match: () => true } ],
	] )( 'throws on %s', ( _name, def ) => {
		expect( () =>
			registerWindowMenuItem(
				def as unknown as Parameters< typeof registerWindowMenuItem >[ 0 ],
			),
		).toThrow();
	} );

	test( 'checkable without checked throws', () => {
		// A checkable row with no reader would paint permanently
		// unchecked — silently wrong in exactly the way the throw-on-
		// register policy exists to prevent.
		expect( () =>
			registerWindowMenuItem( { id: 'a', ...ACTION, checkable: true } ),
		).toThrow( /checked/ );
	} );

	test( 'checkable with checked registers', () => {
		registerWindowMenuItem( {
			id: 'a',
			...ACTION,
			checkable: true,
			checked: () => true,
		} );
		expect( listWindowMenuItems()[ 0 ].checkable ).toBe( true );
	} );

	test( 'match filters per window', () => {
		registerWindowMenuItem( {
			id: 'corkboard',
			...ACTION,
			match: ( w ) => w.id === 'desktop-mode-content-graph',
		} );
		expect(
			menuItemsForWindow( fakeWindow( 'desktop-mode-content-graph' ) ),
		).toHaveLength( 1 );
		expect( menuItemsForWindow( fakeWindow( 'edit-php' ) ) ).toHaveLength(
			0,
		);
	} );

	test( 'a throwing match excludes only that item', () => {
		// One plugin's bad predicate must not cost the user every
		// other plugin's rows.
		registerWindowMenuItem( {
			id: 'bad',
			...ACTION,
			match: () => {
				throw new Error( 'boom' );
			},
		} );
		registerWindowMenuItem( { id: 'good', ...ACTION } );
		const items = menuItemsForWindow( fakeWindow( 'w' ) );
		expect( items.map( ( i ) => i.id ) ).toEqual( [ 'good' ] );
	} );

	test( 'sorts by order, defaulting to 100', () => {
		registerWindowMenuItem( { id: 'late', ...ACTION, order: 200 } );
		registerWindowMenuItem( { id: 'default', ...ACTION } );
		registerWindowMenuItem( { id: 'early', ...ACTION, order: 10 } );
		expect( menuItemsForWindow( fakeWindow( 'w' ) ).map( ( i ) => i.id ) )
			.toEqual( [ 'early', 'default', 'late' ] );
	} );

	test( 'unregisters by owner', () => {
		registerWindowMenuItem( { id: 'mine', ...ACTION, owner: 'my-plugin' } );
		registerWindowMenuItem( { id: 'theirs', ...ACTION, owner: 'other' } );
		registerWindowMenuItem( { id: 'ownerless', ...ACTION } );
		expect( unregisterWindowMenuItemsByOwner( 'my-plugin' ) ).toBe( 1 );
		expect( listWindowMenuItems().map( ( i ) => i.id ).sort() ).toEqual( [
			'ownerless',
			'theirs',
		] );
	} );

	test( 'unregistering by an empty owner is a no-op', () => {
		registerWindowMenuItem( { id: 'a', ...ACTION } );
		expect( unregisterWindowMenuItemsByOwner( '' ) ).toBe( 0 );
		expect( listWindowMenuItems() ).toHaveLength( 1 );
	} );

	test( 'notifies subscribers once per write', () => {
		const cb = vi.fn();
		const off = subscribeWindowMenuItems( cb );
		registerWindowMenuItem( { id: 'a', ...ACTION } );
		expect( cb ).toHaveBeenCalledTimes( 1 );
		unregisterWindowMenuItem( 'a' );
		expect( cb ).toHaveBeenCalledTimes( 2 );
		// Unregistering something absent writes nothing, so it
		// notifies nothing.
		unregisterWindowMenuItem( 'a' );
		expect( cb ).toHaveBeenCalledTimes( 2 );
		off();
		registerWindowMenuItem( { id: 'b', ...ACTION } );
		expect( cb ).toHaveBeenCalledTimes( 2 );
	} );
} );
