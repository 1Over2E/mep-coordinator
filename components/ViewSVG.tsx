
import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Shape, Point3D, Route, Section, Wall, Hallway, LineSegment, DrawingTool, Point2D, Room, Endpoint, Trunk, TagSettings, SelectionState, Branch, RouteOptions, Clash, PlanView } from '../types';
import { worldToScreen, screenToWorld, SCREEN_W, SCREEN_H, MAX_DEPTH, ViewType } from '../utils/viewport';
import { applyCamera, projectPointToSectionPlane } from '../utils/projection';
import { useCamera } from '../hooks/useCamera';
import { findRouteAStar, resolveCollisions, keepInScreen, getShapeBBox, getAttachmentRects, checkParallelism, getHallwayPolygon, getSnappedPoint, isPointClose } from '../services/mepService';
import { HallwayState, SectionCreationState } from '../App';

const GRID_SPACING = 50;

// Simple Throttle Hook
function useThrottle<T>(value: T, limit: number): T {
    const [throttledValue, setThrottledValue] = useState(value);
    const lastRan = useRef(Date.now());
    useEffect(() => {
        const handler = setTimeout(() => {
            if (Date.now() - lastRan.current >= limit) {
                setThrottledValue(value);
                lastRan.current = Date.now();
            }
        }, limit - (Date.now() - lastRan.current));
        return () => clearTimeout(handler);
    }, [value, limit]);
    return throttledValue;
}

interface ViewSVGProps {
    viewType: ViewType;
    shapes: Shape[];
    routes: Route[];
    walls?: Wall[];
    setWalls?: React.Dispatch<React.SetStateAction<Wall[]>>;
    camera: ReturnType<typeof useCamera>;
    settings: {
        showGrid?: boolean;
        showAxes?: boolean;
        rectBaseline?: number;
        circleCenterline?: number;
        tolerance?: number;
    };
    hoveredRouteId?: string | null;
    setHoveredRouteId: (id: string | null) => void;
    
    selection?: SelectionState | null;
    setSelection?: (sel: SelectionState | null) => void;
    selectedIndex?: number | null;
    setSelectedIndex?: (index: number | null) => void;

    setShapes?: React.Dispatch<React.SetStateAction<Shape[]>>;
    routingState?: string;
    setRoutingState?: (state: 'idle' | 'pickingStart' | 'pickingEnd') => void;
    startPoint?: Point3D | null;
    setStartPoint?: (point: Point3D | null) => void;
    setRoutes?: React.Dispatch<React.SetStateAction<Route[]>>;
    
    hallway?: Hallway;
    setHallway?: React.Dispatch<React.SetStateAction<Hallway>>;
    hallwayState?: HallwayState;
    setHallwayState?: React.Dispatch<React.SetStateAction<HallwayState>>;
    hallwayViolations?: string[];
    clashes?: Clash[];

    sections?: Section[];
    sectionCreationState?: SectionCreationState;
    setSectionCreationState?: (state: SectionCreationState) => void;
    sectionDraftStart?: Point3D | null;
    onDefineSectionPoint?: (p: Point3D) => void;
    titleOverride?: string;
    activeSection?: Section | null;

    activeTool?: DrawingTool;
    setActiveTool?: (t: DrawingTool) => void;
    rooms?: Room[]; setRooms?: React.Dispatch<React.SetStateAction<Room[]>>;
    endpoints?: Endpoint[]; setEndpoints?: React.Dispatch<React.SetStateAction<Endpoint[]>>;
    trunks?: Trunk[]; setTrunks?: React.Dispatch<React.SetStateAction<Trunk[]>>;
    branches?: Branch[];
    
    routeOptions?: RouteOptions;
    tagSettings?: TagSettings;
    searchQuery?: string;

    // CAD / Plan Props
    activePlan?: PlanView;
    isCadEditable?: boolean;
    onUpdatePlan?: (updates: Partial<PlanView>) => void;
}

// ----- MEMOIZED LAYERS -----

const GridLayer = React.memo(({ showGrid, viewType }: { showGrid: boolean, viewType: ViewType }) => {
    if (!showGrid || viewType === '3d') return null;
    return (
        <>
            <defs><pattern id="grid" width={GRID_SPACING} height={GRID_SPACING} patternUnits="userSpaceOnUse"><path d={`M ${GRID_SPACING} 0 L 0 0 0 ${GRID_SPACING}`} fill="none" stroke="rgba(100,116,139,0.3)" strokeWidth="1"/></pattern></defs>
            <rect width="100%" height="100%" fill="url(#grid)" style={{pointerEvents: 'none'}} />
        </>
    );
});

const AxesLayer = React.memo(({ showAxes, viewType }: { showAxes: boolean, viewType: ViewType }) => {
    if (!showAxes || viewType === '3d') return null;
    if (viewType === 'front') {
        return (
            <g pointerEvents="none">
                <line x1="20" y1={SCREEN_H - 20} x2="20" y2="40" stroke="#34d399" strokeWidth="2" />
                <text x="25" y="40" fill="#34d399" fontSize="16" fontWeight="bold">+Z (Up)</text>
                <line x1="20" y1={SCREEN_H - 20} x2={SCREEN_W - 40} y2={SCREEN_H - 20} stroke="#f87171" strokeWidth="2" />
                <text x={SCREEN_W - 40} y={SCREEN_H - 25} fill="#f87171" fontSize="16" fontWeight="bold">+X</text>
            </g>
        );
    }
    if (viewType === 'plan') {
         return (
            <g pointerEvents="none">
                <line x1="20" y1="20" x2="20" y2={SCREEN_H - 40} stroke="#60a5fa" strokeWidth="2" />
                <text x="25" y={SCREEN_H - 40} fill="#60a5fa" fontSize="16" fontWeight="bold">+Y (Depth)</text>
                <line x1="20" y1={SCREEN_H - 40} x2={SCREEN_W - 40} y2={SCREEN_H - 40} stroke="#f87171" strokeWidth="2" />
                <text x={SCREEN_W - 40} y={SCREEN_H - 60} fill="#f87171" fontSize="16" fontWeight="bold">+X</text>
            </g>
        );
    }
    if (viewType === 'section') {
        return (
            <g pointerEvents="none">
                <line x1="20" y1={SCREEN_H - 20} x2="20" y2="40" stroke="#34d399" strokeWidth="2" />
                <text x="25" y="40" fill="#34d399" fontSize="16" fontWeight="bold">+Z (Up)</text>
                <line x1="20" y1={SCREEN_H - 20} x2={SCREEN_W - 40} y2={SCREEN_H - 20} stroke="#c084fc" strokeWidth="2" />
                <text x={SCREEN_W - 40} y={SCREEN_H - 25} fill="#c084fc" fontSize="16" fontWeight="bold">Along Cut</text>
            </g>
        );
    }
    return null;
});

const SectionProjectionLayer = React.memo(({ section, routes, clashes, thickness }: { section: Section, routes: Route[], clashes: Clash[], thickness: number }) => {
    const halfThickness = Math.max(1, thickness / 2);
    const project = (p: Point3D) => projectPointToSectionPlane(p, section, SCREEN_H);

    return (
        <g>
            {routes.map((r: Route) => {
                const projectedPath = r.path.map(pt => project(pt));
                const nearestOffset = Math.min(...projectedPath.map(p => Math.abs(p.offset)));

                if (!Number.isFinite(nearestOffset) || nearestOffset > halfThickness) return null;
                const opacity = Math.max(0.25, 1 - (nearestOffset / (halfThickness * 1.5)));

                return (
                    <polyline
                        key={r.id}
                        points={projectedPath.map(p => `${p.point.x},${p.point.y}`).join(' ')}
                        fill="none"
                        stroke="cyan"
                        strokeWidth="2"
                        opacity={opacity}
                    />
                );
            })}

            {clashes.map(c => {
                const proj = project(c.at);
                if (!Number.isFinite(proj.offset) || Math.abs(proj.offset) > halfThickness) return null;
                return (
                    <g key={c.id} transform={`translate(${proj.point.x},${proj.point.y})`}>
                        <circle r={c.severity === 'hard' ? 8 : 5} fill="none" stroke={c.severity === 'hard' ? 'red' : 'yellow'} strokeWidth="2" className="animate-ping" />
                        <circle r="2" fill="white" />
                    </g>
                );
            })}
        </g>
    );
});

const StaticShapesLayer = React.memo(({ viewType, shapes, selection, violations, searchQuery, tagSettings, rectBaseline, circleCenterline, endpoints, rooms, trunks, branches, hallway }: any) => {
    if (viewType === '3d') return null; 
    
    const getStyle = (tag: string) => {
        if (!tagSettings) return { display: 'block', opacity: 1 };
        const s = tagSettings[tag];
        return { display: s.visible ? 'block' : 'none', opacity: s.opacity };
    };

    if (viewType === 'front') {
        let polyString = '';
        let bandColor = 'rgba(0, 255, 0, 0.1)';
        if (hallway && hallway.line1 && hallway.line2) {
            if (!hallway.isValid) bandColor = 'rgba(255, 0, 0, 0.1)';
            else if (violations.length > 0) bandColor = 'rgba(255, 0, 0, 0.2)';
            const polyWorldStr = getHallwayPolygon(hallway);
            if (polyWorldStr) {
                const pts = polyWorldStr.split(' ').map((p: string) => {
                    const [x,z] = p.split(',').map(Number);
                    const scr = worldToScreen({x, y:0, z}, 'front');
                    return `${scr.x},${scr.y}`;
                });
                polyString = pts.join(' ');
            }
        }
        
        return (
            <>
                <g style={getStyle('trunk')}>
                     {trunks.map((t: Trunk) => {
                         const s1 = worldToScreen({x: t.p1.x, y:0, z:t.p1.z}, 'front');
                         const s2 = worldToScreen({x: t.p2.x, y:0, z:t.p2.z}, 'front');
                         return <line key={t.id} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke="#3b82f6" strokeWidth={t.width/5} strokeLinecap="square" />; 
                     })}
                </g>
                <g style={getStyle('hallway')}>
                     {polyString && <polygon points={polyString} fill={bandColor} stroke="none" />}
                </g>
                <line x1="0" y1={SCREEN_H - rectBaseline} x2={SCREEN_W} y2={SCREEN_H - rectBaseline} stroke="rgba(251,146,60,0.5)" strokeWidth="1" strokeDasharray="4" />
                <line x1="0" y1={SCREEN_H - circleCenterline} x2={SCREEN_W} y2={SCREEN_H - circleCenterline} stroke="rgba(52,211,153,0.5)" strokeWidth="1" strokeDasharray="4" />

                {shapes.map((s: Shape) => {
                    const isSelected = selection?.type === 'shape' && selection.id === s.id;
                    const isViolation = violations.includes(s.id);
                    const isSearched = searchQuery && s.displayName && s.displayName.toLowerCase().includes(searchQuery.toLowerCase());
                    const screenX = s.x;
                    const screenY = s.type === 'rect' ? SCREEN_H - (s.y + s.h) : SCREEN_H - s.y; 
                    const strokeColor = isViolation ? 'red' : (isSelected || isSearched ? 'yellow' : (s.type === 'rect' ? '#6a330c' : '#10553a'));
                    const strokeWidth = isViolation || isSelected || isSearched ? 4 : 2;
                    const tag = s.type === 'rect' ? 'duct' : 'pipe';
                    
                    return (
                        <g key={s.id} style={getStyle(tag)}>
                            {getAttachmentRects(s).map((r, idx) => (
                                 <rect key={`att-${s.id}-${idx}`} x={r.x} y={SCREEN_H - (r.y + r.height)} width={r.width} height={r.height} fill="#666" stroke="none" opacity={0.7} style={getStyle('branch')} />
                            ))}
                            {s.type === 'circle' ? (
                                <circle cx={screenX} cy={screenY} r={s.r} fill="#34d399" stroke={strokeColor} strokeWidth={strokeWidth} />
                            ) : (
                                <rect x={screenX} y={screenY} width={s.w} height={s.h} fill="#fb923c" stroke={strokeColor} strokeWidth={strokeWidth} />
                            )}
                            {(isSelected || isSearched) && (
                                <text x={screenX} y={screenY - 10} fill="yellow" fontSize="12" fontWeight="bold">{s.displayName}</text>
                            )}
                        </g>
                    );
                })}
                
                <g style={getStyle('endpoint')}>
                     {endpoints.map((ep: Endpoint) => {
                         const s = worldToScreen({...ep, y: 0}, 'front');
                         return (
                            <g key={ep.id} transform={`translate(${s.x}, ${s.y})`}>
                                <circle r="4" fill="red" />
                                <text x="8" y="4" fill="white" fontSize="10">{ep.displayName}</text>
                            </g>
                         );
                     })}
                 </g>
            </>
        );
    }
    
    // Plan View Fallback
    if (viewType === 'plan') {
        const shapeDepth = MAX_DEPTH * 0.4;
        return (
            <>
                {/* Render Rooms in Plan - Rooms coordinates are X, Z (where Z is Depth/Y) */}
                <g style={getStyle('room')}>
                    {rooms.map((r: Room) => (
                         <polygon key={r.id} points={r.points.map(p => `${p.x},${p.z}`).join(' ')} fill="rgba(100,200,255,0.15)" stroke="#60a5fa" strokeWidth="2" />
                    ))}
                </g>

                {shapes.map((s: Shape) => (
                     <g key={s.id} style={getStyle(s.type === 'rect' ? 'duct' : 'pipe')}>
                          <rect x={s.x} y={0} width={s.type==='rect'?s.w : s.r*2} height={shapeDepth} fill={searchQuery && s.displayName?.includes(searchQuery) ? "yellow" : "gray"} opacity={0.3} />
                     </g>
                ))}
                {branches.map((b: Branch) => (
                     <polyline key={b.id} points={b.path.map((p: Point3D) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="magenta" strokeWidth="1" strokeDasharray="4,4" opacity="0.6" style={getStyle('branch')} />
                ))}
            </>
        );
    }
    
    return null;
});

const ViewSVG: React.FC<ViewSVGProps> = ({
    viewType, shapes, routes, walls = [], camera, settings, hoveredRouteId, setHoveredRouteId,
    selection, setSelection, setSelectedIndex, setShapes,
    routingState, setRoutingState, startPoint, setStartPoint, setRoutes,
    hallway, setHallway, hallwayState, setHallwayState, hallwayViolations = [], clashes = [],
    activeTool = 'none', setActiveTool, rooms = [], setRooms, endpoints = [], setEndpoints, trunks = [], setTrunks, branches = [],
    tagSettings, searchQuery, routeOptions,
    sections, sectionCreationState, setSectionCreationState, sectionDraftStart, onDefineSectionPoint, titleOverride, activeSection,
    activePlan, isCadEditable, onUpdatePlan
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dragged, setDragged] = useState<{ index: number, offsetX: number, offsetY: number } | null>(null);
    const [cadDrag, setCadDrag] = useState<{ startX: number, startY: number, initX: number, initY: number } | null>(null);
    const { onMouseDown: onCameraMouseDown, onMouseMove: onCameraMouseMove, onMouseUp: onCameraMouseUp } = camera;

    // Drawing State
    const [drawPoints, setDrawPoints] = useState<Point2D[]>([]);
    const [cursorPos, setCursorPos] = useState<Point2D>({x:0, z:0});
    const [snappedCursor, setSnappedCursor] = useState<{pt: Point2D, snapped: boolean, type?: string} | null>(null);
    const [tempP1, setTempP1] = useState<{ x: number, z: number } | null>(null);

    // Throttle cursor updates to 60fps (~16ms) to prevent excessive React updates
    const throttledCursor = useThrottle(cursorPos, 16);

    // Reset tool state
    useEffect(() => { setDrawPoints([]); setTempP1(null); }, [activeTool]);

    const getSvgCoords = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const pt = svgRef.current.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const { x, y } = pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse());
        return { x, y };
    };

    const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        if (viewType === '3d') { onCameraMouseDown(e); return; }
        const { x: svgX, y: svgY } = getSvgCoords(e);
        const clickWorld = screenToWorld({x: svgX, y: svgY}, viewType);

        // Handle CAD Move (Plan View only)
        if (viewType === 'plan' && isCadEditable && activePlan && onUpdatePlan) {
            setCadDrag({ startX: svgX, startY: svgY, initX: activePlan.cadX, initY: activePlan.cadY });
            e.stopPropagation();
            return;
        }

        // Section Creation Point 1 (Plan View)
        if (viewType === 'plan' && sectionCreationState === 'start' && onDefineSectionPoint) {
            onDefineSectionPoint({ x: clickWorld.x, y: clickWorld.y, z: 0 });
            return;
        }
        // Section Creation Point 2 (Plan View)
        if (viewType === 'plan' && sectionCreationState === 'end' && onDefineSectionPoint) {
            onDefineSectionPoint({ x: clickWorld.x, y: clickWorld.y, z: 0 });
            return;
        }

        // Drawing Tools
        if (activeTool && activeTool !== 'none' && (viewType === 'front' || viewType === 'plan')) {
            // ENFORCE RULES: Room only in Plan
            if (activeTool === 'room' && viewType !== 'plan') return;
            // ENFORCE RULES: Routing only in Front
            if ((activeTool === 'endpoint' || activeTool === 'trunk') && viewType !== 'front') return;

            // Correct mapping for Plan View: Screen Y corresponds to World Depth (stored in z for Point2D)
            const rawPt = viewType === 'plan' 
                ? { x: clickWorld.x, z: clickWorld.y } 
                : { x: clickWorld.x, z: clickWorld.z };

            const pt = snappedCursor?.snapped ? snappedCursor.pt : rawPt;
            const newId = Date.now().toString();

            if (activeTool === 'endpoint') {
                if(setEndpoints) setEndpoints(prev => [...prev, { id: `ep-${newId}`, displayName: `Endpoint ${prev.length+1}`, ...pt }]);
            } else if (activeTool === 'trunk') {
                if (drawPoints.length === 0) setDrawPoints([pt]);
                else {
                    if (setTrunks) setTrunks(prev => [...prev, { id: `tr-${newId}`, displayName: `Trunk ${prev.length+1}`, p1: drawPoints[0], p2: pt, width: 20 }]);
                    setDrawPoints([]);
                }
            } else if (activeTool === 'room') {
                if (drawPoints.length > 2 && isPointClose(pt, drawPoints[0], 10)) {
                    if(setRooms) setRooms(prev => [...prev, { id: `rm-${newId}`, displayName: `Room ${prev.length+1}`, points: drawPoints }]);
                    setDrawPoints([]);
                } else {
                    setDrawPoints(prev => [...prev, pt]);
                }
            }
            return;
        }

        if (hallwayState && hallwayState !== 'idle' && hallwayState !== 'complete' && setHallwayState && setHallway) {
             const pt = { x: clickWorld.x, z: clickWorld.z };
             if (hallwayState === 'drawing_line1_start') { setTempP1(pt); setHallwayState('drawing_line1_end'); }
             else if (hallwayState === 'drawing_line1_end') { if (tempP1) { setHallway(p => ({ ...p, line1: { p1: tempP1, p2: pt } })); setTempP1(null); setHallwayState('drawing_line2_start'); } }
             else if (hallwayState === 'drawing_line2_start') { setTempP1(pt); setHallwayState('drawing_line2_end'); }
             else if (hallwayState === 'drawing_line2_end') { if (tempP1 && hallway?.line1) { const l2 = { p1: tempP1, p2: pt }; const isValid = checkParallelism(hallway.line1, l2); setHallway(p => ({ ...p, line2: l2, isValid })); setTempP1(null); setHallwayState('complete'); } }
             return;
        }

        if (setShapes && setSelection && viewType === 'front') {
            for (let i = shapes.length - 1; i >= 0; i--) {
                const s = shapes[i];
                const screenX = s.x;
                const screenY = s.type === 'rect' ? SCREEN_H - (s.y + s.h) : SCREEN_H - s.y; 
                let hit = false;
                if (s.type === 'circle') { if (Math.hypot(svgX - screenX, svgY - screenY) <= s.r) hit = true; } 
                else { const topY = SCREEN_H - (s.y + s.h); const botY = SCREEN_H - s.y; if (svgX >= s.x && svgX <= s.x + s.w && svgY >= topY && svgY <= botY) hit = true; }

                if (hit) {
                    setSelection({ type: 'shape', id: s.id });
                    setDragged({ index: i, offsetX: svgX - s.x, offsetY: (SCREEN_H - s.y) - svgY });
                    e.stopPropagation();
                    return;
                }
            }
            setSelection(null);
        }
    };
    
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (viewType === '3d') { onCameraMouseMove(e); return; }
        const { x: svgX, y: svgY } = getSvgCoords(e);
        
        // Handle CAD Drag
        if (cadDrag && onUpdatePlan) {
            const dx = svgX - cadDrag.startX;
            const dy = svgY - cadDrag.startY;
            onUpdatePlan({ cadX: cadDrag.initX + dx, cadY: cadDrag.initY + dy });
            return;
        }

        const mouseWorld = screenToWorld({x: svgX, y: svgY}, viewType);

        if (activeTool && activeTool !== 'none') {
             // Correct mapping for Plan View
             const pt = viewType === 'plan' 
                ? { x: mouseWorld.x, z: mouseWorld.y } 
                : { x: mouseWorld.x, z: mouseWorld.z };
             
             setCursorPos(pt); // Triggers throttle via state update
             // Only snap to rooms if we are in Plan View (since rooms are 2D plan objects)
             const snapRooms = viewType === 'plan' ? rooms : [];
             const snap = getSnappedPoint(pt, snapRooms, trunks, settings.showGrid);
             setSnappedCursor(snap);
        }

        if (sectionCreationState === 'end' && onDefineSectionPoint) {
            // Just tracking cursor for visual line (Plan view uses Y as depth)
             setCursorPos({x: mouseWorld.x, z: mouseWorld.y});
        }

        if (dragged && setShapes && viewType === 'front') {
            const newZ = SCREEN_H - (svgY + dragged.offsetY);
            const newX = svgX - dragged.offsetX;
            const newShapes = JSON.parse(JSON.stringify(shapes));
            const s = newShapes[dragged.index];
            s.x = newX; s.y = newZ; 
            keepInScreen(s); 
            setShapes(newShapes);
        }
    };
    
    const handleMouseUp = () => {
        if (viewType === '3d') onCameraMouseUp();
        if (dragged && setShapes && settings.tolerance !== undefined) {
             setShapes(resolveCollisions(shapes, settings.tolerance, settings.rectBaseline!, settings.circleCenterline!, walls));
        }
        setDragged(null);
        setCadDrag(null);
    };

    const viewBox = `0 0 ${SCREEN_W} ${SCREEN_H}`;
    const isDrawingContext = (viewType === 'front' || viewType === 'plan') && (activeTool !== 'none' || sectionCreationState !== 'idle');
    const svgCursorClass = dragged || cadDrag ? 'cursor-grabbing' : (isDrawingContext ? 'cursor-crosshair' : '');

    return (
        <div className="w-full h-full flex flex-col">
            <h3 className="text-center font-bold text-gray-400 text-sm py-1 bg-gray-900 z-10 flex justify-center items-center gap-2">
                {titleOverride || (viewType === 'front' ? "Front Elevation" : viewType === 'plan' ? "Plan View" : "3D View")}
            </h3>
            <div className="flex-1 relative">
                <svg
                    ref={svgRef}
                    width="100%"
                    height="100%"
                    viewBox={viewBox}
                    className={`absolute top-0 left-0 ${svgCursorClass}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <rect width="100%" height="100%" fill="transparent" />
                    <GridLayer showGrid={!!settings.showGrid} viewType={viewType} />
                    <AxesLayer showAxes={!!settings.showAxes} viewType={viewType} />

                    {/* CAD Layer (Bottom) - Only in Plan View */}
                    {viewType === 'plan' && activePlan && activePlan.cadImage && (
                        <image
                            href={activePlan.cadImage}
                            x={activePlan.cadX}
                            y={activePlan.cadY}
                            transform={`scale(${activePlan.cadScale})`}
                            opacity={activePlan.cadOpacity}
                            style={{ pointerEvents: isCadEditable ? 'auto' : 'none', cursor: isCadEditable ? 'move' : 'default' }}
                        />
                    )}
                    
                    <StaticShapesLayer
                        viewType={viewType} shapes={shapes} selection={selection}
                        violations={hallwayViolations} searchQuery={searchQuery}
                        tagSettings={tagSettings} rectBaseline={settings.rectBaseline}
                        circleCenterline={settings.circleCenterline}
                        rooms={rooms} trunks={trunks} endpoints={endpoints} branches={branches} hallway={hallway}
                    />

                    {viewType === 'section' && activeSection && (
                        <SectionProjectionLayer
                            section={activeSection}
                            routes={routes}
                            clashes={clashes}
                            thickness={routeOptions?.sectionDepthPx || 200}
                        />
                    )}

                    {/* Section Cuts Overlay (Plan View) */}
                    {viewType === 'plan' && sections && (
                        <g>
                            {sections.map(sec => (
                                <g key={sec.id}>
                                    <line
                                        x1={sec.p1.x} y1={sec.p1.y}
                                        x2={sec.p2.x} y2={sec.p2.y} 
                                        stroke={activeSection?.id === sec.id ? "cyan" : "rgba(255,255,255,0.5)"} 
                                        strokeWidth="2" 
                                        strokeDasharray="10,5" 
                                    />
                                    <text x={sec.p1.x} y={sec.p1.y} fill="white" fontSize="10">{sec.name}</text>
                                </g>
                            ))}
                            {/* Drawing New Section */}
                            {sectionCreationState === 'end' && cursorPos && sectionDraftStart && (
                                <line
                                    x1={sectionDraftStart.x}
                                    y1={sectionDraftStart.y}
                                    x2={cursorPos.x} y2={cursorPos.z}
                                    stroke="yellow" strokeWidth="2" strokeDasharray="5,5"
                                />
                            )}
                        </g>
                    )}

                    {/* Dynamic Interaction Layer (Clashes, Routes, Tool Overlays) */}
                    {(viewType === 'front' || viewType === 'plan') && (
                        <>
                             {/* Clashes */}
                             {clashes.map(c => {
                                 const s = worldToScreen({x: c.at.x, y: 0, z: c.at.z}, viewType);
                                 return (
                                     <g key={c.id} transform={`translate(${s.x},${s.y})`}>
                                         <circle r={c.severity === 'hard' ? 8 : 5} fill="none" stroke={c.severity === 'hard' ? 'red' : 'yellow'} strokeWidth="2" className="animate-ping" />
                                         <circle r="2" fill="white" />
                                     </g>
                                 )
                             })}

                             {/* Routes */}
                             {routes.map((r: Route) => (
                                 <polyline key={r.id} points={r.path.map(p => {
                                     const s = worldToScreen(p, viewType);
                                     return `${s.x},${s.y}`;
                                 }).join(' ')} fill="none" stroke="cyan" strokeWidth="2" opacity="0.8" />
                             ))}

                             {/* Tool Overlays */}
                             {activeTool === 'room' && drawPoints.length > 0 && viewType === 'plan' && (
                                <polyline points={drawPoints.map(p => {
                                     // Plan View: Points are X, Depth
                                     return `${p.x},${p.z}`;
                                }).join(' ')} fill="none" stroke="white" strokeWidth="2" strokeDasharray="5,5" />
                             )}
                             
                             {/* Snapped Cursor */}
                             {activeTool !== 'none' && (
                                <g pointerEvents="none" transform={`translate(${
                                    (viewType === 'plan' ? (snappedCursor?.pt || cursorPos).x : worldToScreen({...((snappedCursor?.pt || cursorPos) as Point2D), y: 0}, 'front').x)
                                }, ${
                                    (viewType === 'plan' ? (snappedCursor?.pt || cursorPos).z : worldToScreen({...((snappedCursor?.pt || cursorPos) as Point2D), y: 0}, 'front').y)
                                })`}>
                                     <circle r="6" fill="none" stroke={snappedCursor?.snapped ? 'cyan' : 'gray'} strokeWidth="1" />
                                </g>
                             )}
                        </>
                    )}
                    
                    {viewType === '3d' && <ThreeDViewContent shapes={shapes} routes={routes} walls={walls} camera={camera} rooms={rooms} trunks={trunks} endpoints={endpoints} branches={branches} tagSettings={tagSettings} searchQuery={searchQuery} />}
                </svg>
            </div>
        </div>
    );
};

const ThreeDViewContent: React.FC<any> = React.memo(({ shapes, routes, camera, rooms, trunks, endpoints, branches, tagSettings, searchQuery }) => {
    // 3D Rendering logic (simplified for React.memo)
    const drawableObjects = useMemo(() => {
        const items: any[] = [];
        shapes.forEach((s: Shape) => {
             const tag = s.type === 'rect' ? 'duct' : 'pipe';
             if (tagSettings && !tagSettings[tag].visible) return;
             const isSearched = searchQuery && s.displayName && s.displayName.toLowerCase().includes(searchQuery.toLowerCase());
             const yStart = 0, yEnd = MAX_DEPTH * 0.4; 
             let vertices: Point3D[], faces: number[][], color = isSearched ? '#fef08a' : (s.type === 'rect' ? '#fb923c' : '#34d399'), center: Point3D;

             if (s.type === 'rect') {
                 const x1 = s.x, x2 = s.x + s.w, z1 = s.y, z2 = s.y + s.h;
                 vertices = [{x:x1, y:yStart, z:z1}, {x:x2, y:yStart, z:z1}, {x:x2, y:yStart, z:z2}, {x:x1, y:yEnd, z:z2}, {x:x1, y:yEnd, z:z1}, {x:x2, y:yEnd, z:z1}, {x:x2, y:yEnd, z:z2}, {x:x1, y:yEnd, z:z2}];
                 faces = [[0,1,2,3], [5,4,7,6], [0,4,5,1], [1,5,6,2], [2,6,7,3], [3,7,4,0]];
                 center = {x: x1+s.w/2, y: yEnd/2, z: z1+s.h/2};
             } else {
                 const SEGMENTS = 8; // Reduce for performance
                 vertices = [];
                 for(let i=0; i<SEGMENTS; i++) { const ang = (i/SEGMENTS)*Math.PI*2; vertices.push({x: s.x + s.r*Math.cos(ang), y: yStart, z: s.y + s.r*Math.sin(ang)}); }
                 for(let i=0; i<SEGMENTS; i++) { const ang = (i/SEGMENTS)*Math.PI*2; vertices.push({x: s.x + s.r*Math.cos(ang), y: yEnd, z: s.y + s.r*Math.sin(ang)}); }
                 faces = [];
                 center = {x: s.x, y: yEnd/2, z: s.y};
             }
             const centered = {x: center.x - SCREEN_W/2, y: center.y - MAX_DEPTH/2, z: center.z - SCREEN_H/2};
             const rot = applyCamera(centered, camera.pitch, camera.yaw);
             items.push({id: s.id, _3d: {vertices, faces, color, sortKey: rot.z}});
        });
        return items.sort((a,b) => b._3d.sortKey - a._3d.sortKey);
    }, [shapes, camera, tagSettings, searchQuery]);

    return (
        <g>
            {drawableObjects.map(obj => {
                const { vertices, faces, color } = obj._3d;
                const projVerts = vertices.map((v: Point3D) => {
                    const centered = {x: v.x - SCREEN_W/2, y: v.y - MAX_DEPTH/2, z: v.z - SCREEN_H/2};
                    const rot = applyCamera(centered, camera.pitch, camera.yaw);
                    const scale = 800 / (800 + rot.y); 
                    return { x: rot.x * scale + SCREEN_W/2, y: rot.z * scale + SCREEN_H/2 }; 
                });
                return faces?.map((face: number[], i: number) => (
                    <polygon key={i} points={face.map(vi => `${projVerts[vi].x},${projVerts[vi].y}`).join(' ')} fill={color} stroke="black" strokeWidth="0.5" />
                ));
            })}
        </g>
    );
});

export default ViewSVG;
