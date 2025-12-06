import React from 'react';
import Icon from './Icon';

interface BulkEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    text: string;
    setText: (text: string) => void;
    error: string;
    onApply: () => void;
    onSave: () => string;
    onLoadRequest: () => void;
}

const BulkEditModal: React.FC<BulkEditModalProps> = ({ isOpen, onClose, text, setText, error, onApply, onSave, onLoadRequest }) => {
    if (!isOpen) return null;

    const handleSaveToFile = () => {
        const content = onSave();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'layout.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="bg-gray-900 rounded-lg shadow-xl w-3/4 h-3/4 flex flex-col p-4 border border-cyan-500/30" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-bold mb-2 text-cyan-400">Bulk Edit Layout</h2>
                <p className="text-xs text-gray-400 mb-2">Define layout using text. Rect: `120x60 @ x=40`, Pipe: `r=45 @ x=120`. Add `attach` for branches. Directives: `baseline=...`, `tolerance=...`</p>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    className="flex-grow bg-gray-800 text-mono p-2 rounded border border-gray-700 w-full font-mono text-sm focus:ring-cyan-500 focus:border-cyan-500"
                />
                {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                <div className="flex justify-end gap-2 mt-4">
                   <button onClick={handleSaveToFile} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors">
                       <Icon icon="save" className="w-5 h-5" /> Save to File
                   </button>
                   <button onClick={onLoadRequest} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded transition-colors">
                       <Icon icon="load" className="w-5 h-5" /> Load from File
                   </button>
                   <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded transition-colors">Cancel</button>
                   <button onClick={onApply} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded transition-colors">Apply Layout</button>
                </div>
            </div>
        </div>
    );
};

export default BulkEditModal;
