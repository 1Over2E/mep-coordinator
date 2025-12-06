
import React, { useState, useEffect } from 'react';
import { Section, Shape, Route, Point3D, PlanView, Wall, Room, Endpoint, Trunk, Branch, RouteOptions, TagSettings, DrawingTool } from '../types';
import Icon from './Icon';
import ViewSVG from './ViewSVG';
import { useCamera } from '../hooks/useCamera';
import { RoutingState, SectionCreationState } from '../App';

interface SectionPanelProps {
    shapes: Shape[];
    routes: Route[];
    walls: Wall[];
    sections: Section[];
    plans: PlanView[];
    activePlanId: string;
    setActivePlanId: (id: string) => void;
    activeSectionId: string | null;
    setActiveSectionId: (id: string | null) => void;
    
    onStartSectionCreation: () => void;
    onDeleteSection: (id: string) => void;
    onAddPlan: () => void;
    onUpdatePlan: (updates: Partial<PlanView>) => void;
    onDeletePlan: (id: string) => void;

    camera: ReturnType<typeof useCamera>;

    // Props for Interactive View
    settings: {
        showGrid?: boolean;
        showAxes?: boolean;
        rectBaseline?: number;
        circleCenterline?: number;
        tolerance?: number;
    };
    selectedIndex: number | null;
    setSelectedIndex: (index: number | null) => void;
    setShapes: React.Dispatch<React.SetStateAction<Shape[]>>;
    routingState: RoutingState;
    setRoutingState: (state: RoutingState) => void;
    startPoint: Point3D | null;
    setStartPoint: (point: Point3D | null) => void;
    setRoutes: React.Dispatch<React.SetStateAction<Route[]>>;
    sectionCreationState: SectionCreationState;
    setSectionCreationState: (state: SectionCreationState) => void;
    onDefineSectionPoint: (p: Point3D) => void;
    
    // Pass through props for ViewSVG
    activeTool?: DrawingTool;
    setActiveTool?: (t: DrawingTool) => void;
    rooms?: Room[]; setRooms?: React.Dispatch<React.SetStateAction<Room[]>>;
    endpoints?: Endpoint[]; setEndpoints?: React.Dispatch<React.SetStateAction<Endpoint[]>>;
    trunks?: Trunk[]; setTrunks?: React.Dispatch<React.SetStateAction<Trunk[]>>;
    branches?: Branch[];
    routeOptions?: RouteOptions;
    tagSettings?: TagSettings;
    searchQuery?: string;

    // Override
    viewTitleOverride?: string;
    viewType?: 'plan' | 'front' | 'section';
}

const SectionPanel: React.FC<SectionPanelProps> = ({
    shapes, routes, walls, sections, plans, activePlanId, setActivePlanId, activeSectionId, setActiveSectionId,
    onStartSectionCreation, onDeleteSection, onAddPlan, onUpdatePlan, onDeletePlan,
    camera,
    settings, selectedIndex, setSelectedIndex, setShapes, routingState, setRoutingState, startPoint, setStartPoint, setRoutes,
    sectionCreationState, setSectionCreationState, onDefineSectionPoint,
    activeTool, setActiveTool, rooms, setRooms, endpoints, setEndpoints, trunks, setTrunks, branches, routeOptions, tagSettings, searchQuery,
    viewTitleOverride, viewType = 'plan'
}) => {
    const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
    const [isCadEditable, setIsCadEditable] = useState(false);

    const activeSection = sections.find(s => s.id === activeSectionId) || null;
    const activePlan = plans.find(p => p.id === activePlanId);

    // Force Plan View (plan) when creating a section to allow drawing the cut line
    const effectiveViewType = (sectionCreationState === 'start' || sectionCreationState === 'end' || !activeSectionId) 
        ? 'plan' 
        : 'section';
        
    const effectiveTitle = (sectionCreationState === 'start' || sectionCreationState === 'end')
        ? "Draw Section Cut (Plan View)"
        : (activeSectionId ? `Section: ${activeSection?.name}` : `Plan: ${activePlan?.name || 'Overview'}`);

    const handleCadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                onUpdatePlan({ cadImage: ev.target?.result as string });
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    return (
        <div className="w-full h-full flex flex-col relative bg-gray-900 overflow-hidden border border-gray-700 rounded-md">
            {/* Header */}
            <div className="flex bg-gray-800 border-b border-gray-700 p-2 items-center justify-between z-30 relative">
                <span className="text-gray-400 font-bold text-sm ml-2">Plan & Section Manager</span>
            </div>

            {/* View List / Controls Overlay */}
            <div className="absolute top-12 left-2 z-20 flex flex-col gap-2 max-h-[85%] overflow-y-auto w-72 pointer-events-none">
                <div className="bg-gray-800/95 backdrop-blur rounded p-3 border border-gray-700 pointer-events-auto shadow-lg space-y-4">
                    
                    {/* PRIMARY ACTIONS: Active Plan Tools - Only show if NO active section (i.e. we are in Plan Mode) */}
                    {!activeSectionId && activePlan && (
                        <div className="space-y-3 pb-3 border-b border-gray-600">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-cyan-400 uppercase tracking-wider">{activePlan.name} SETUP</span>
                            </div>
                            
                            <div className="space-y-2">
                                {/* 1. CAD Underlay */}
                                <div className="bg-gray-700/50 rounded p-2 border border-gray-600">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1"><Icon icon="document-duplicate" className="w-3 h-3"/>CAD UNDERLAY</span>
                                        {activePlan.cadImage && (
                                             <label className="cursor-pointer text-[10px] text-blue-400 hover:text-blue-300">
                                                 Replace
                                                 <input type="file" accept="image/*" className="hidden" onChange={handleCadFileChange} />
                                             </label>
                                        )}
                                    </div>
                                    
                                    {!activePlan.cadImage ? (
                                        <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-600 rounded p-4 cursor-pointer hover:bg-gray-700 transition-colors group">
                                             <Icon icon="load" className="w-6 h-6 text-gray-500 group-hover:text-cyan-400"/>
                                             <span className="text-xs text-gray-400 group-hover:text-white font-bold">Pick CAD Drawing</span>
                                             <span className="text-[9px] text-gray-500">Image format (PNG, JPG)</span>
                                             <input type="file" accept="image/*" className="hidden" onChange={handleCadFileChange} />
                                        </label>
                                    ) : (
                                        <div className="space-y-2">
                                            <button 
                                                onClick={() => setIsCadEditable(!isCadEditable)} 
                                                className={`w-full text-xs py-1.5 rounded border flex items-center justify-center gap-2 font-bold ${isCadEditable ? 'bg-yellow-900/50 text-yellow-200 border-yellow-600' : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'}`}
                                            >
                                                <Icon icon="target" className="w-3 h-3"/>
                                                {isCadEditable ? "Finish Adjusting" : "Adjust Position & Scale"}
                                            </button>
                                            
                                            {isCadEditable && (
                                                <div className="grid grid-cols-2 gap-2 p-1 bg-black/20 rounded">
                                                    <div className="col-span-2 flex items-center gap-2">
                                                        <span className="text-[9px] text-gray-500 w-8">Scale</span>
                                                        <input 
                                                            type="range" min="0.1" max="5" step="0.01" 
                                                            value={activePlan.cadScale} 
                                                            onChange={(e) => onUpdatePlan({cadScale: parseFloat(e.target.value)})} 
                                                            className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                                        />
                                                    </div>
                                                    <div className="col-span-2 flex items-center gap-2">
                                                        <span className="text-[9px] text-gray-500 w-8">Opac</span>
                                                        <input 
                                                            type="range" min="0" max="1" step="0.1" 
                                                            value={activePlan.cadOpacity} 
                                                            onChange={(e) => onUpdatePlan({cadOpacity: parseFloat(e.target.value)})} 
                                                            className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* 2. Draw Room */}
                                <button 
                                    onClick={() => setActiveTool && setActiveTool(activeTool === 'room' ? 'none' : 'room')}
                                    className={`w-full flex items-center justify-center gap-2 py-3 rounded text-sm font-bold transition-all shadow-sm ${activeTool === 'room' ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-400' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
                                >
                                    <Icon icon="square" className="w-5 h-5"/> 
                                    {activeTool === 'room' ? 'Drawing Room Boundary...' : 'Draw Rooms'}
                                </button>
                                <p className="text-[10px] text-gray-500 text-center">Trace rooms over CAD before routing pipes.</p>
                            </div>
                        </div>
                    )}

                    {/* Navigation Section */}
                    <div className="space-y-3">
                        {/* PLAN VIEWS LIST */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Levels / Plans</span>
                                <button onClick={onAddPlan} className="text-cyan-400 hover:text-white p-1" title="Add Level"><Icon icon="plus" className="w-3 h-3"/></button>
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {plans.map(plan => (
                                    <div key={plan.id} className="flex items-center gap-1 group">
                                         <button
                                            onClick={() => { setActivePlanId(plan.id); setActiveSectionId(null); }}
                                            className={`flex-grow text-left text-xs py-1.5 px-2 rounded flex items-center justify-between transition-colors ${activePlanId === plan.id && !activeSectionId ? 'bg-cyan-900 text-white font-bold ring-1 ring-cyan-700' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
                                         >
                                            <span className="truncate">{plan.name}</span>
                                            {activePlanId === plan.id && !activeSectionId && <Icon icon="check" className="w-3 h-3"/>}
                                         </button>
                                         <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                             <input 
                                                type="number" 
                                                value={plan.z} 
                                                onChange={(e) => onUpdatePlan({z: parseInt(e.target.value)})}
                                                className="w-12 bg-gray-900 border border-gray-600 rounded px-1 py-0.5 text-[9px] text-gray-300 text-right mr-1"
                                                placeholder="Elev"
                                                title="Elevation (Z)"
                                             />
                                             {plans.length > 1 && (
                                                 <button onClick={(e) => { e.stopPropagation(); onDeletePlan(plan.id); }} className="text-gray-500 hover:text-red-400 p-1">
                                                    <Icon icon="trash" className="w-3 h-3"/>
                                                 </button>
                                             )}
                                         </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* SECTIONS LIST */}
                        <div>
                            <div className="flex items-center justify-between mb-1 pt-2 border-t border-gray-700">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Section Views</span>
                                 <button 
                                    onClick={onStartSectionCreation} 
                                    className={`p-1 rounded ${sectionCreationState !== 'idle' ? 'text-yellow-400 bg-yellow-900/20' : 'text-cyan-400 hover:text-white'}`}
                                    title="Create New Section Cut"
                                >
                                    <Icon icon="plus" className="w-3 h-3" />
                                </button>
                            </div>
                             {sections.length === 0 && <div className="text-[10px] text-gray-600 italic px-2">No sections defined.</div>}
                             <div className="space-y-1 max-h-32 overflow-y-auto">
                                {sections.map(sec => (
                                    <div key={sec.id} className="flex items-center gap-1 group">
                                         <button
                                            onClick={() => setActiveSectionId(sec.id)}
                                            className={`flex-grow text-left text-xs py-1.5 px-2 rounded flex items-center justify-between transition-colors ${activeSectionId === sec.id ? 'bg-purple-900 text-white font-bold ring-1 ring-purple-600' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
                                         >
                                            <span className="truncate">{sec.name}</span>
                                            {activeSectionId === sec.id && <Icon icon="check" className="w-3 h-3"/>}
                                         </button>
                                         <button onClick={() => onDeleteSection(sec.id)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 p-1">
                                            <Icon icon="trash" className="w-3 h-3"/>
                                         </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <div className="flex-1 relative">
                <ViewSVG
                    viewType={effectiveViewType}
                    activeSection={activeSection}
                    activePlan={activePlan}
                    isCadEditable={isCadEditable && effectiveViewType === 'plan'}
                    onUpdatePlan={onUpdatePlan}
                    shapes={shapes}
                    routes={routes}
                    walls={walls}
                    camera={camera}
                    settings={settings}
                    hoveredRouteId={hoveredRouteId}
                    setHoveredRouteId={setHoveredRouteId}
                    selectedIndex={selectedIndex}
                    setSelectedIndex={setSelectedIndex}
                    setShapes={setShapes}
                    routingState={routingState}
                    setRoutingState={setRoutingState}
                    startPoint={startPoint}
                    setStartPoint={setStartPoint}
                    setRoutes={setRoutes}
                    sections={sections}
                    sectionCreationState={sectionCreationState}
                    setSectionCreationState={setSectionCreationState}
                    onDefineSectionPoint={onDefineSectionPoint}
                    titleOverride={effectiveTitle}
                    
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
        </div>
    );
};

export default SectionPanel;
