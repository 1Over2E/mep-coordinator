import { Point3D } from '../types';

export type ViewType = 'front' | 'plan' | '3d' | 'section';

export const SCREEN_W = 1000;
export const SCREEN_H = 800; // Represents View Height (Z in front view, Y in plan view)
export const MAX_DEPTH = 400; // World Y depth

// Primary Coordinate System: Front Elevation
// World Origin: Bottom-Left of the room (X=0, Y=0, Z=0)
// X: Right
// Y: Depth (Into screen)
// Z: Up

export const worldToScreen = (p: Point3D, view: ViewType): { x: number, y: number } => {
    switch (view) {
        case 'front':
            // Front Elevation: X-Z plane.
            // Screen X = World X
            // Screen Y = Height - World Z (Inverted because SVG Y is down)
            return { x: p.x, y: SCREEN_H - p.z };
        case 'plan':
            // Plan View: X-Y plane.
            // Screen X = World X
            // Screen Y = World Y (Depth)
            return { x: p.x, y: p.y };
        default:
            return { x: p.x, y: p.y };
    }
};

export const screenToWorld = (s: { x: number, y: number }, view: ViewType, depthOrElevation: number = 0): Point3D => {
    switch (view) {
        case 'front':
            // S.y = Height - W.z  =>  W.z = Height - S.y
            // W.y is undefined by click, effectively 'depth' param
            return { x: s.x, y: depthOrElevation, z: SCREEN_H - s.y };
        case 'plan':
            // S.y = W.y
            // W.z is undefined by click, effectively 'elevation' param
            return { x: s.x, y: s.y, z: depthOrElevation };
        default:
            return { x: s.x, y: s.y, z: 0 };
    }
};
