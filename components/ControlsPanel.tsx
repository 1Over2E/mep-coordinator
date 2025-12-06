
import React from 'react';
import { Shape, Wall, DrawingTool, TagSettings, TagType, SelectionState, RouteOptions, BranchStyle, Clash } from '../types';
import Icon from './Icon';
import { HallwayState } from '../App';

interface ControlsPanelProps {
    shapes: Shape[];
    setShapes: React.Dispatch<React.SetStateAction<Shape[]>>;
    walls: Wall[];
    tolerance: number;
    setTolerance: (value: number) => void;
    rectBaseline: number;
    setRectBaseline: (value: number) => void;
    circleCenterline: number;
    setCircleCenterline: (value: number) => void;
    
    selection: SelectionState | null;
    setSelection: (sel: SelectionState | null) => void;
    
    runResolution: () => void;
    runEnforceRules: () => void;
    assignIds: (shapes: Shape[]) => Shape[];
    onOpenBulkEdit: () => void;
    showGrid: boolean;
    setShowGrid: (value: boolean) => void;
    showAxes: boolean;
    setShowAxes: (value: boolean) => void;
    onStartRouting: () => void;
    onClearRoutes: () => void;
    onBackToConfig: () => void;

    hallwayState?: HallwayState;
    setHallwayState?: (s: HallwayState) => void;
    hallwayViolations?: string[];
    onClearHallway?: () => void;

    activeTool?: DrawingTool;
    setActiveTool?: (t: DrawingTool) => void;

    tagSettings?: TagSettings;
    setTagSettings?: (t: TagSettings) => void;
    
    searchQuery: string;
    setSearchQuery: (s: string) => void;

    routeOptions: RouteOptions;
    setRouteOptions: React.Dispatch<React.SetStateAction<RouteOptions>>;

    onSaveProject?: () => void;
    onLoadProject?: () => void;
    onExportRoutes?: () => void;
    onSnapshot?: () => void;

    onUndo?: () => void;
    onRedo?: () => void;
    clashes?: Clash[];
    canUndo?: boolean;
    canRedo?: boolean;
}

const ControlsPanel: React.FC<ControlsPanelProps> = (props) => {
    const { 
        shapes, setShapes, walls, tolerance, setTolerance, rectBaseline, setRectBaseline, 
        circleCenterline, setCircleCenterline, selection, setSelection, runResolution, 
        runEnforceRules, assignIds, onOpenBulkEdit, showGrid, setShowGrid, showAxes, setShowAxes, 
        onStartRouting, onClearRoutes, onBackToConfig,
        hallwayState, setHallwayState, hallwayViolations = [], onClearHallway,
        activeTool, setActiveTool,
        tagSettings, setTagSettings,
        searchQuery, setSearchQuery,
        routeOptions, setRouteOptions,
        onSaveProject, onLoadProject, onExportRoutes, onSnapshot,
        onUndo, onRedo, clashes = [], canUndo, canRedo
    } = props;

    const addShape = (type: 'circle' | 'rect') => {
        setShapes(prev => {
            const newShape: Shape = type === 'circle'
                ? { type: 'circle', id: '', displayName: 'New Pipe', x: 100, y: circleCenterline, r: 40, attach: null }
                : { type: 'rect', id: '', displayName: 'New Duct', x: 100, y: rectBaseline, w: 120, h: 80, attach: null };
            return assignIds([...prev, newShape]);
        });
        setTimeout(runResolution, 0);
    };
    
    const deleteSelected = () => {
        if (selection?.type === 'shape') {
            setShapes(prev => prev.filter(s => s.id !== selection.id));
            setSelection(null);
        }
    };

    const ToolButton = ({ tool, icon, label, shortcut }: { tool: DrawingTool, icon: string, label: string, shortcut: string }) => (
        <button 
            onClick={() => setActiveTool && setActiveTool(activeTool === tool ? 'none' : tool)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-bold transition-colors ${activeTool === tool ? 'bg-cyan-700 text-white border border-cyan-500' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
            <div className="flex items-center gap-2"><Icon icon={icon} className="w-4 h-4"/> {label}</div>
            <span className="text-[10px] bg-gray-900 px-1 rounded opacity-70">{shortcut}</span>
        </button>
    );

    const toggleTag = (tag: TagType) => {
        if (!tagSettings || !setTagSettings) return;
        setTagSettings({ ...tagSettings, [tag]: { ...tagSettings[tag], visible: !tagSettings[tag].visible }});
    };
    
    const setTagOpacity = (tag: TagType, val: number) => {
        if (!tagSettings || !setTagSettings) return;
        setTagSettings({ ...tagSettings, [tag]: { ...tagSettings[tag], opacity: val }});
    };

    const TagRow = ({ tag, label }: { tag: TagType, label: string }) => {
        if (!tagSettings) return null;
        const s = tagSettings[tag];
        return (
            <div className="flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center gap-2 w-24">
                    <button onClick={() => toggleTag(tag)} className={s.visible ? "text-cyan-400" : "text-gray-600"}>
                        <Icon icon={s.visible ? "eye" : "eye-slash"} className="w-4 h-4" />
                    </button>
                    <span className="capitalize">{label}</span>
                </div>
                <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={s.opacity} 
                    onChange={e => setTagOpacity(tag, parseFloat(e.target.value))}
                    className="w-16 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    disabled={!s.visible}
                />
            </div>
        );
    };

    const handleUpdateName = (val: string) => {
        if (!selection) return;
        if (selection.type === 'shape') {
            setShapes(prev => prev.map(s => s.id === selection.id ? { ...s, displayName: val } : s));
        }
    };
    
    const getSelectionName = () => {
        if (!selection) return '';
        if (selection.type === 'shape') {
            return shapes.find(s => s.id === selection.id)?.displayName || '';
        }
        return selection.id;
    }
    
    return (
        <div className="w-72 bg-gray-900 p-4 space-y-4 overflow-y-auto flex flex-col border-r border-gray-700 relative">
             {hallwayViolations.length > 0 && (
                <div className="absolute top-0 left-0 w-full bg-red-600/90 text-white p-2 text-xs font-bold text-center z-50">
                    HALLWAY VIOLATION: {hallwayViolations.length} elements outside band.
                </div>
            )}

            <div className="flex flex-col gap-2">
                 <div className="flex items-center justify-between">
                    <h1 className="text-xl font-bold text-cyan-400">Controls</h1>
                    <div className="flex gap-1">
                        {onUndo && <button onClick={onUndo} disabled={!canUndo} className={`p-1 ${canUndo ? 'hover:text-white text-gray-400' : 'text-gray-700'}`} title="Undo"><Icon icon="arrow-uturn-left" className="w-5 h-5"/></button>}
                        {onRedo && <button onClick={onRedo} disabled={!canRedo} className={`p-1 ${canRedo ? 'hover:text-white text-gray-400' : 'text-gray-700'}`} title="Redo"><Icon icon="arrow-uturn-right" className="w-5 h-5"/></button>}
                    </div>
                 </div>
                 
                 <div className="relative">
                    <Icon icon="search" className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input 
                        type="text" 
                        placeholder="Find by name..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-800 text-xs text-white pl-8 pr-2 py-1.5 rounded border border-gray-700 focus:border-cyan-500 outline-none"
                    />
                 </div>
            </div>

            <div className="space-y-2 border-b border-gray-700 pb-4">
                <h2 className="font-bold text-gray-400 text-sm">Tools</h2>
                <div className="grid grid-cols-1 gap-1">
                    <ToolButton tool="room" icon="square" label="Draw Room" shortcut="R" />
                    <ToolButton tool="endpoint" icon="target" label="Endpoint" shortcut="E" />
                    <ToolButton tool="trunk" icon="cube" label="Draw Trunk" shortcut="T" />
                </div>
            </div>
            
            <div className="space-y-2 border-b border-gray-700 pb-4">
                <h2 className="font-bold text-gray-400 text-sm flex items-center gap-2"><Icon icon="branch" className="w-4 h-4"/>Branch Options</h2>
                <div className="space-y-2 text-xs">
                     <label className="block">
                         <span className="text-gray-500 block mb-1">Branch Style</span>
                         <select 
                            value={routeOptions.branchStyle} 
                            onChange={e => setRouteOptions(prev => ({...prev, branchStyle: e.target.value as BranchStyle}))}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white"
                         >
                             <option value="vertical-first">Vertical First</option>
                             <option value="takeoff-45">Takeoff 45°</option>
                         </select>
                     </label>
                     <label className="block">
                         <span className="text-gray-500 block mb-1">Section Depth (Y): {routeOptions.sectionDepthPx}px</span>
                         <input 
                             type="range" min="50" max="600" step="10" 
                             value={routeOptions.sectionDepthPx} 
                             onChange={e => setRouteOptions(prev => ({...prev, sectionDepthPx: parseInt(e.target.value)}))}
                             className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer" 
                         />
                     </label>
                </div>
            </div>

            {tagSettings && (
                <div className="space-y-2 border-b border-gray-700 pb-4">
                    <h2 className="font-bold text-gray-400 text-sm">Visibility & Tags</h2>
                    <div className="space-y-1">
                        <TagRow tag="hallway" label="Hallway" />
                        <TagRow tag="room" label="Room" />
                        <TagRow tag="trunk" label="Trunk" />
                        <TagRow tag="duct" label="Ducts" />
                        <TagRow tag="pipe" label="Pipes" />
                        <TagRow tag="branch" label="Branches" />
                        <TagRow tag="endpoint" label="Endpoints" />
                        <TagRow tag="wall" label="Walls" />
                    </div>
                </div>
            )}

            <div className="space-y-2 border-b border-gray-700 pb-4">
                <button onClick={runResolution} className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded transition-colors"><Icon icon="wand" className="w-5 h-5"/>Resolve Clashes</button>
                {clashes.length > 0 && (
                    <div className="bg-gray-800 border border-red-500/30 rounded p-2 max-h-32 overflow-y-auto">
                        <div className="text-xs font-bold text-red-400 mb-1">{clashes.length} CLASHES FOUND</div>
                        {clashes.map(c => (
                            <div key={c.id} className="text-[10px] flex justify-between items-center text-gray-300 py-0.5 border-b border-gray-700 last:border-0">
                                <span>{c.aId} vs {c.bId}</span>
                                <span className={c.severity === 'hard' ? 'text-red-500' : 'text-yellow-500'}>{c.severity}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => addShape('rect')} className="bg-orange-500 hover:bg-orange-400 text-white py-2 px-2 rounded text-sm">Add Duct</button>
                    <button onClick={() => addShape('circle')} className="bg-green-500 hover:bg-green-400 text-white py-2 px-2 rounded text-sm">Add Pipe</button>
                </div>
                 <button onClick={onStartRouting} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-4 rounded"><Icon icon="route" className="w-5 h-5"/>Route</button>
                 <button onClick={onClearRoutes} className="w-full flex items-center justify-center gap-2 bg-red-800 hover:bg-red-700 text-white py-1 px-2 rounded text-xs"><Icon icon="x-circle" className="w-4 h-4"/>Clear Routes</button>
            </div>
            
            <div className="border-b border-gray-700 pb-4 space-y-2">
                 <h2 className="font-bold text-gray-400 text-sm flex items-center gap-2"><Icon icon="scissors" className="w-4 h-4"/>Hallway Constraint</h2>
                 {hallwayState === 'idle' || hallwayState === 'complete' ? (
                     <div className="flex gap-2">
                        <button 
                            onClick={() => setHallwayState && setHallwayState('drawing_line1_start')} 
                            className="flex-1 bg-teal-600 hover:bg-teal-500 text-white py-1 px-2 rounded text-xs flex items-center justify-center gap-1"
                        >
                            Define Hallway
                        </button>
                        {hallwayState === 'complete' && (
                             <button 
                                onClick={onClearHallway} 
                                className="bg-gray-700 hover:bg-red-600 text-white py-1 px-2 rounded text-xs"
                            >
                                Clear
                            </button>
                        )}
                     </div>
                 ) : (
                     <div className="text-xs text-yellow-400 animate-pulse text-center border border-yellow-500 rounded p-1">
                         {hallwayState?.includes('line1') ? "Click Start & End for Line 1" : "Click Start & End for Line 2"}
                     </div>
                 )}
            </div>

            <div className="border-b border-gray-700 pb-4 space-y-2">
                <h2 className="font-bold text-gray-400 text-sm">Exports</h2>
                <div className="grid grid-cols-3 gap-1">
                    {onSaveProject && <button onClick={onSaveProject} className="bg-gray-700 hover:bg-gray-600 text-[10px] py-1 rounded">Save State</button>}
                    {onSnapshot && <button onClick={onSnapshot} className="bg-gray-700 hover:bg-gray-600 text-[10px] py-1 rounded">Snapshot</button>}
                    {onExportRoutes && <button onClick={onExportRoutes} className="bg-gray-700 hover:bg-gray-600 text-[10px] py-1 rounded">Routes JSON</button>}
                </div>
            </div>

            <div className="space-y-3 pt-2">
                <h2 className="font-bold text-gray-400 text-sm flex items-center gap-2"><Icon icon="gear" className="w-5 h-5"/>SETTINGS (Z-Axis)</h2>
                 <button onClick={onOpenBulkEdit} className="w-full flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-500 py-2 px-2 rounded text-sm"><Icon icon="text" className="w-5 h-5"/>Edit Shape Text</button>
                 <label className="block"><span className="text-sm">Tolerance: {tolerance}px</span><input type="range" min="-50" max="50" value={tolerance} onChange={e => setTolerance(Number(e.target.value))} onMouseUp={runResolution} className="w-full" /></label>
                 <label className="block"><span className="text-sm">Duct Elevation (Bottom): {rectBaseline}</span><input type="range" min="0" max={800} value={rectBaseline} onChange={e => setRectBaseline(Number(e.target.value))} onMouseUp={runEnforceRules} className="w-full" /></label>
                 <label className="block"><span className="text-sm">Pipe Elevation (Center): {circleCenterline}</span><input type="range" min="0" max={800} value={circleCenterline} onChange={e => setCircleCenterline(Number(e.target.value))} onMouseUp={runEnforceRules} className="w-full" /></label>
                 <div className="flex gap-4 text-sm"><label className="flex items-center gap-1"><input type="checkbox" checked={showGrid} onChange={() => setShowGrid(!showGrid)} /> Grid</label><label className="flex items-center gap-1"><input type="checkbox" checked={showAxes} onChange={() => setShowAxes(!showAxes)} /> Axes</label></div>
            </div>
            
            <div className="flex-grow"></div>
            {selection && (
                <div className="border-t border-gray-700 pt-4 space-y-2">
                     <h2 className="font-bold text-cyan-400 text-sm">SELECTED:</h2>
                     <div className="text-xs text-gray-400">ID: {selection.id}</div>
                     <input 
                        type="text" 
                        value={getSelectionName()} 
                        onChange={e => handleUpdateName(e.target.value)} 
                        className="w-full bg-gray-800 text-white text-sm p-1 rounded border border-gray-600"
                     />
                     <button onClick={deleteSelected} className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white py-1 px-2 rounded text-xs"><Icon icon="trash" className="w-4 h-4" />Delete</button>
                </div>
            )}
            <button onClick={onBackToConfig} className="text-sm text-gray-400 hover:text-white mt-4 flex items-center gap-2 justify-center">
                <Icon icon="arrow-uturn-left" className="w-5 h-5" /> Back to Config
            </button>
        </div>
    );
};
export default ControlsPanel;
