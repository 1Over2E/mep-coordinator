
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Shape, Point3D, Route, Wall, Hallway, DrawingTool, Room, Endpoint, Trunk, TagSettings, ProjectState, Branch, RouteOptions, ElementType, SelectionState, Clash, HistoryState, PlanView, Section } from './types';
import { resolveCollisions, enforceRules, findRouteAStar, serializeShapesToBulk, parseBulkTextToShapes, validateHallway, generateBranches, assignIds, detectClashes } from './services/mepService';
import { SCREEN_W, SCREEN_H } from './utils/viewport';
import Icon from './components/Icon';
import ControlsPanel from './components/ControlsPanel';
import BulkEditModal from './components/BulkEditModal';
import ViewSVG from './components/ViewSVG';
import SectionPanel from './components/SectionPanel';
import { useCamera } from './hooks/useCamera';

type AppState = 'CONFIG' | 'PLAY';
export type RoutingState = 'idle' | 'pickingStart' | 'pickingEnd';
export type HallwayState = 'idle' | 'drawing_line1_start' | 'drawing_line1_end' | 'drawing_line2_start' | 'drawing_line2_end' | 'complete';
export type SectionCreationState = 'idle' | 'start' | 'end';

const DEFAULT_TAG_SETTINGS: TagSettings = {
    hallway: { visible: true, opacity: 1.0 },
    room: { visible: true, opacity: 1.0 },
    wall: { visible: true, opacity: 1.0 },
    shaft: { visible: true, opacity: 1.0 },
    endpoint: { visible: true, opacity: 1.0 },
    trunk: { visible: true, opacity: 1.0 },
    duct: { visible: true, opacity: 1.0 },
    pipe: { visible: true, opacity: 1.0 },
    branch: { visible: true, opacity: 1.0 },
};

const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
    branchStyle: 'vertical-first',
    sectionDepthPx: 200,
    minBendRadiusPx: 20
};

const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>('PLAY'); 
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [walls, setWalls] = useState<Wall[]>([]);
    const [tolerance, setTolerance] = useState(0);
    const [rectElevation, setRectElevation] = useState(300);
    const [pipeElevation, setPipeElevation] = useState(600);
    
    const [selection, setSelection] = useState<SelectionState | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkError, setBulkError] = useState('');
    
    const [showGrid, setShowGrid] = useState(true);
    const [showAxes, setShowAxes] = useState(true);

    const [routingState, setRoutingState] = useState<RoutingState>('idle');
    const [startPoint, setStartPoint] = useState<Point3D | null>(null);
    const [routes, setRoutes] = useState<Route[]>([]);
    const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);

    const [hallwayState, setHallwayState] = useState<HallwayState>('idle');
    const [hallway, setHallway] = useState<Hallway>({ line1: null, line2: null, isValid: false });
    const [hallwayViolations, setHallwayViolations] = useState<string[]>([]);

    const [activeTool, setActiveTool] = useState<DrawingTool>('none');
    const [rooms, setRooms] = useState<Room[]>([]);
    const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
    const [trunks, setTrunks] = useState<Trunk[]>([]);

    const [branches, setBranches] = useState<Branch[]>([]);
    const [routeOptions, setRouteOptions] = useState<RouteOptions>(DEFAULT_ROUTE_OPTIONS);
    const [tagSettings, setTagSettings] = useState<TagSettings>(DEFAULT_TAG_SETTINGS);
    const [clashes, setClashes] = useState<Clash[]>([]);
    
    // Multi-View & Section Logic
    const [plans, setPlans] = useState<PlanView[]>([{ id: 'plan-1', name: 'Level 1', z: 0, cadScale: 1, cadX: 0, cadY: 0, cadOpacity: 0.5 }]);
    const [activePlanId, setActivePlanId] = useState<string>('plan-1');
    const [sections, setSections] = useState<Section[]>([]);
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [sectionCreationState, setSectionCreationState] = useState<SectionCreationState>('idle');
    const [tempSectionStart, setTempSectionStart] = useState<Point3D | null>(null);

    // History (Undo/Redo)
    const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const projectFileInputRef = useRef<HTMLInputElement>(null);
    const camera = useCamera();

    const pushHistory = useCallback(() => {
        const currentState: ProjectState = {
            version: 1, shapes, walls, rooms, endpoints, trunks, hallway, routes, branches, clashes, routeOptions, tagSettings
        };
        setHistory(prev => ({ past: [...prev.past.slice(-20), currentState], future: [] }));
    }, [shapes, walls, rooms, endpoints, trunks, hallway, routes, branches, clashes, routeOptions, tagSettings]);

    useEffect(() => {
        const newBranches = generateBranches(trunks, endpoints, routeOptions);
        setBranches(newBranches);
    }, [trunks, endpoints, routeOptions]);

    const handleUndo = () => {
        if (history.past.length === 0) return;
        const previous = history.past[history.past.length - 1];
        const current: ProjectState = { version: 1, shapes, walls, rooms, endpoints, trunks, hallway, routes, branches, clashes, routeOptions, tagSettings };
        setHistory(prev => ({ past: prev.past.slice(0, -1), future: [current, ...prev.future] }));
        restoreState(previous);
    };

    const handleRedo = () => {
        if (history.future.length === 0) return;
        const next = history.future[0];
        const current: ProjectState = { version: 1, shapes, walls, rooms, endpoints, trunks, hallway, routes, branches, clashes, routeOptions, tagSettings };
        setHistory(prev => ({ past: [...prev.past, current], future: prev.future.slice(1) }));
        restoreState(next);
    };

    const restoreState = (state: ProjectState) => {
        setShapes(state.shapes);
        setWalls(state.walls);
        setRooms(state.rooms);
        setEndpoints(state.endpoints);
        setTrunks(state.trunks);
        setHallway(state.hallway);
        setRoutes(state.routes);
        setBranches(state.branches);
        setClashes(state.clashes);
        setRouteOptions(state.routeOptions);
        setTagSettings(state.tagSettings);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); handleUndo(); return; }
            if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Z')) { e.preventDefault(); handleRedo(); return; }

            switch(e.key.toLowerCase()) {
                case 'r': setActiveTool('room'); break;
                case 'e': setActiveTool('endpoint'); break;
                case 't': setActiveTool('trunk'); break;
                case 'escape': 
                    setActiveTool('none'); 
                    setRoutingState('idle');
                    setHallwayState('idle');
                    setSelection(null);
                    setSectionCreationState('idle');
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [history]);

    const handleStartRouting = () => {
        if (hallwayViolations.length > 0) {
            alert("Cannot route: Hallway boundaries violated. Please move components inside the hallway band.");
            return;
        }
        if (routingState !== 'idle') {
            setRoutingState('idle');
            setStartPoint(null);
        } else {
            setRoutingState('pickingStart');
        }
    };

    const runResolution = useCallback(() => {
        pushHistory();
        setShapes(prevShapes => {
             const resolved = resolveCollisions(prevShapes, tolerance, rectElevation, pipeElevation, walls);
             setClashes(detectClashes(resolved, walls));
             return resolved;
        });
    }, [tolerance, rectElevation, pipeElevation, walls, pushHistory]);
    
    const runEnforceRules = useCallback(() => {
        setShapes(prevShapes => {
            const newShapes = JSON.parse(JSON.stringify(prevShapes));
            enforceRules(newShapes, rectElevation, pipeElevation);
            return newShapes;
        });
    }, [rectElevation, pipeElevation]);

    useEffect(() => {
        if (hallway.isValid && hallway.line1 && hallway.line2) {
            const result = validateHallway(hallway, shapes);
            setHallwayViolations(result.violations);
        } else {
            setHallwayViolations([]);
        }
    }, [shapes, hallway]);
    
    const handleApplyBulkText = () => {
        pushHistory();
        try {
            const { shapes: newShapes, rectElevation: re, pipeElevation: pe, tolerance: tol } = parseBulkTextToShapes(bulkText);
            if (re !== undefined) setRectElevation(re);
            if (pe !== undefined) setPipeElevation(pe);
            if (tol !== undefined) setTolerance(tol);
            
            assignIds(newShapes);
            enforceRules(newShapes, re ?? rectElevation, pe ?? pipeElevation);
            setShapes(resolveCollisions(newShapes, tol ?? tolerance, re ?? rectElevation, pe ?? pipeElevation, walls));
            
            setIsBulkEditOpen(false);
            setBulkError('');
            if (appState === 'CONFIG') setAppState('PLAY');
        } catch (error) {
            setBulkError(error instanceof Error ? error.message : "An unknown error occurred");
        }
    };

    const handleSaveProject = () => {
        const project: ProjectState = { version: 1, shapes, walls, rooms, endpoints, trunks, hallway, routes, branches, clashes, routeOptions, tagSettings };
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mep-project-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExportRoutes = () => {
        const data = { routes: [...routes, ...branches.map(b => ({ id: b.id, path: b.path }))], tags: tagSettings };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mep-routes-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const handleSnapshot = () => {
        const svg = document.querySelector('svg');
        if (!svg) return;
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        canvas.width = SCREEN_W;
        canvas.height = SCREEN_H;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            ctx?.drawImage(img, 0, 0);
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = 'snapshot.png';
            a.click();
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    };

    const handleLoadProject = () => {
        const input = projectFileInputRef.current;
        if (!input) return;
        input.value = '';
        input.click();
    };

    const handleProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const project = JSON.parse(ev.target?.result as string) as ProjectState;
                if (project.version === 1) {
                    restoreState(project);
                    setAppState('PLAY');
                } else {
                    alert("Unknown project version");
                }
            } catch (err) {
                alert("Failed to load project file");
            }
        };
        reader.readAsText(file);
    };

    // Plan Management Handlers
    const handleAddPlan = () => {
        const newPlan: PlanView = { id: `plan-${Date.now()}`, name: `Level ${plans.length + 1}`, z: (plans.length) * 300, cadScale: 1, cadX: 0, cadY: 0, cadOpacity: 0.5 };
        setPlans(prev => [...prev, newPlan]);
        setActivePlanId(newPlan.id);
        setActiveSectionId(null);
    };
    const handleUpdatePlan = (updates: Partial<PlanView>) => {
        setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, ...updates } : p));
    };
    const handleDeletePlan = (id: string) => {
        setPlans(prev => prev.filter(p => p.id !== id));
        if (activePlanId === id && plans.length > 1) setActivePlanId(plans[0].id);
    };

    // Section Management
    const handleStartSectionCreation = () => {
        setSectionCreationState('start');
        setTempSectionStart(null);
        setActiveTool('none');
        // Ensure we are viewing the plan to draw the cut
        setActiveSectionId(null);
    };
    const handleDefineSectionPoint = (p: Point3D) => {
        if (sectionCreationState === 'start') {
            setTempSectionStart(p);
            setSectionCreationState('end');
        } else if (sectionCreationState === 'end' && tempSectionStart) {
            const newSection: Section = {
                id: `sec-${Date.now()}`,
                name: `Section ${sections.length + 1}`,
                p1: { x: tempSectionStart.x, y: tempSectionStart.z }, // Map World Z to Plan Y
                p2: { x: p.x, y: p.z }
            };
            setSections(prev => [...prev, newSection]);
            setSectionCreationState('idle');
            setTempSectionStart(null);
            setActiveSectionId(newSection.id);
        }
    };
    const handleDeleteSection = (id: string) => {
        setSections(prev => prev.filter(s => s.id !== id));
        if (activeSectionId === id) setActiveSectionId(null);
    };

    return (
        <div className="flex h-screen bg-gray-800 text-gray-200 font-sans relative">
            <input type="file" ref={projectFileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleProjectFileChange} />
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".txt" onChange={(e) => {
                 const file = e.target.files?.[0];
                 if (!file) return;
                 const reader = new FileReader();
                 reader.onload = (ev) => { setBulkText(ev.target?.result as string); handleApplyBulkText(); };
                 reader.readAsText(file);
            }} />

            <BulkEditModal
                isOpen={isBulkEditOpen}
                onClose={() => setIsBulkEditOpen(false)}
                text={bulkText}
                setText={setBulkText}
                error={bulkError}
                onApply={handleApplyBulkText}
                onSave={() => serializeShapesToBulk(shapes, rectElevation, pipeElevation, tolerance)}
                onLoadRequest={() => fileInputRef.current?.click()}
            />
            
            <ControlsPanel
                shapes={shapes}
                setShapes={setShapes}
                walls={walls}
                tolerance={tolerance}
                setTolerance={setTolerance}
                rectBaseline={rectElevation}
                setRectBaseline={setRectElevation}
                circleCenterline={pipeElevation}
                setCircleCenterline={setPipeElevation}
                selection={selection}
                setSelection={setSelection}
                runResolution={runResolution}
                runEnforceRules={runEnforceRules}
                assignIds={assignIds}
                onOpenBulkEdit={() => {
                    setBulkText(serializeShapesToBulk(shapes, rectElevation, pipeElevation, tolerance));
                    setIsBulkEditOpen(true);
                }}
                showGrid={showGrid}
                setShowGrid={setShowGrid}
                showAxes={showAxes}
                setShowAxes={setShowAxes}
                onStartRouting={handleStartRouting}
                onClearRoutes={() => setRoutes([])}
                onBackToConfig={() => setAppState('CONFIG')}
                
                hallwayState={hallwayState}
                setHallwayState={setHallwayState}
                hallwayViolations={hallwayViolations}
                onClearHallway={() => {
                    setHallway({ line1: null, line2: null, isValid: false });
                    setHallwayState('idle');
                    setHallwayViolations([]);
                }}

                activeTool={activeTool}
                setActiveTool={setActiveTool}

                tagSettings={tagSettings}
                setTagSettings={setTagSettings}

                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}

                routeOptions={routeOptions}
                setRouteOptions={setRouteOptions}

                onSaveProject={handleSaveProject}
                onLoadProject={handleLoadProject}
                onExportRoutes={handleExportRoutes}
                onSnapshot={handleSnapshot}
                onUndo={handleUndo}
                onRedo={handleRedo}
                clashes={clashes}
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
            />
            
            {appState === 'CONFIG' ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 gap-4">
                     <h1 className="text-2xl font-bold text-cyan-400">MEP Layout Tool</h1>
                    <button onClick={() => setAppState('PLAY')} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-4 px-8 rounded-lg text-xl flex items-center gap-3">
                         <Icon icon="wand" className="w-8 h-8"/> New Project
                    </button>
                    <button onClick={handleLoadProject} className="text-gray-400 hover:text-white flex items-center gap-2">
                        <Icon icon="load" className="w-5 h-5"/> Load Existing Project
                    </button>
                </div>
            ) : (
                <main className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 p-4 overflow-hidden relative">
                    {/* Main Workspace: SectionPanel handles Plan Views, CAD, and Section Viewing */}
                    <div className="col-span-1 row-span-2 bg-gray-900 rounded-md shadow-lg overflow-hidden border border-gray-700 relative">
                        <SectionPanel 
                            shapes={shapes}
                            routes={routes}
                            walls={walls}
                            sections={sections}
                            plans={plans}
                            activePlanId={activePlanId}
                            setActivePlanId={setActivePlanId}
                            activeSectionId={activeSectionId}
                            setActiveSectionId={setActiveSectionId}
                            
                            onAddPlan={handleAddPlan}
                            onUpdatePlan={handleUpdatePlan}
                            onDeletePlan={handleDeletePlan}
                            onStartSectionCreation={handleStartSectionCreation}
                            onDeleteSection={handleDeleteSection}
                            
                            camera={camera}
                            settings={{ showGrid, showAxes, rectBaseline: rectElevation, circleCenterline: pipeElevation, tolerance }}
                            selectedIndex={null}
                            setSelectedIndex={()=>{}}
                            setShapes={(newShapes) => { pushHistory(); setShapes(newShapes); }}
                            routingState={routingState}
                            setRoutingState={setRoutingState}
                            startPoint={startPoint}
                            setStartPoint={setStartPoint}
                            setRoutes={setRoutes}
                            sectionCreationState={sectionCreationState}
                            setSectionCreationState={setSectionCreationState}
                            onDefineSectionPoint={handleDefineSectionPoint}
                            
                            activeTool={activeTool}
                            setActiveTool={setActiveTool}
                            rooms={rooms} setRooms={setRooms}
                            endpoints={endpoints} setEndpoints={setEndpoints}
                            trunks={trunks} setTrunks={setTrunks}
                            branches={branches}
                            routeOptions={routeOptions}
                            tagSettings={tagSettings}
                            searchQuery={searchQuery}
                        />
                    </div>

                    {/* Top Right: Front View (Elevation) */}
                    <div className="col-span-1 row-span-1 bg-gray-900 rounded-md shadow-lg overflow-hidden relative border border-gray-700">
                        <ViewSVG
                            viewType="front"
                            shapes={shapes}
                            routes={routes}
                            walls={walls}
                            camera={camera}
                            settings={{ showGrid, showAxes, rectBaseline: rectElevation, circleCenterline: pipeElevation, tolerance }}
                            selection={selection}
                            setSelection={setSelection}
                            setShapes={(newS) => { pushHistory(); setShapes(newS); }}
                            routingState={routingState}
                            setRoutingState={setRoutingState}
                            startPoint={startPoint}
                            setStartPoint={setStartPoint}
                            setRoutes={setRoutes}
                            hoveredRouteId={hoveredRouteId}
                            setHoveredRouteId={setHoveredRouteId}
                            
                            hallway={hallway}
                            setHallway={setHallway}
                            hallwayState={hallwayState}
                            setHallwayState={setHallwayState}
                            hallwayViolations={hallwayViolations}
                            clashes={clashes}

                            activeTool={activeTool}
                            setActiveTool={setActiveTool}
                            rooms={rooms} setRooms={setRooms}
                            endpoints={endpoints} setEndpoints={setEndpoints}
                            trunks={trunks} setTrunks={setTrunks}
                            branches={branches}
                            
                            tagSettings={tagSettings}
                            searchQuery={searchQuery}
                        />
                    </div>

                    {/* Bottom Right: 3D View */}
                    <div className="col-span-1 row-span-1 bg-gray-900 rounded-md shadow-lg overflow-hidden border border-gray-700">
                        <ViewSVG
                            viewType="3d"
                            shapes={shapes}
                            routes={routes}
                            walls={walls}
                            camera={camera}
                            settings={{ showGrid: true, showAxes: true }}
                            hoveredRouteId={hoveredRouteId}
                            setHoveredRouteId={setHoveredRouteId}
                            rooms={rooms}
                            trunks={trunks}
                            endpoints={endpoints}
                            branches={branches}
                            tagSettings={tagSettings}
                            searchQuery={searchQuery}
                        />
                    </div>
                </main>
            )}
        </div>
    );
}
export default App;
