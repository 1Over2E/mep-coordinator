
import { worldToScreen, screenToWorld, SCREEN_H } from './viewport';

declare const describe: any;
declare const test: any;
declare const expect: any;

// Mock dependencies if strictly needed, but viewport is pure.

describe('Viewport Transforms', () => {
    const pOrigin = { x: 0, y: 0, z: 0 };
    const pMid = { x: 500, y: 200, z: 400 };

    test('Front View: World Origin maps to Bottom-Left of Screen', () => {
        const s = worldToScreen(pOrigin, 'front');
        // X stays 0
        // Z=0 (Bottom) maps to ScreenH (Bottom)
        expect(s.x).toBe(0);
        expect(s.y).toBe(SCREEN_H);
    });

    test('Front View: World Up maps to Screen Up', () => {
        const pUp = { x: 100, y: 0, z: SCREEN_H };
        const s = worldToScreen(pUp, 'front');
        expect(s.x).toBe(100);
        expect(s.y).toBe(0);
    });

    test('Front View: Screen Click maps to World Z inverted', () => {
        const click = { x: 100, y: 0 }; // Top left of screen
        const w = screenToWorld(click, 'front', 50);
        // Top of screen is max Z (SCREEN_H)
        expect(w.x).toBe(100);
        expect(w.z).toBe(SCREEN_H);
        expect(w.y).toBe(50); // Preserves depth arg
    });

    test('Plan View: World Y maps to Screen Y', () => {
        const s = worldToScreen(pMid, 'plan');
        expect(s.x).toBe(500);
        expect(s.y).toBe(200); // World Y
    });

    test('Plan View: Screen Click maps to World Y', () => {
        const click = { x: 300, y: 150 };
        const w = screenToWorld(click, 'plan', 100);
        expect(w.x).toBe(300);
        expect(w.y).toBe(150);
        expect(w.z).toBe(100); // Preserves elevation arg
    });
});
