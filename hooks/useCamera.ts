import React, { useState, useCallback } from 'react';

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

export const useCamera = (initialPitch = 0.5, initialYaw = -0.5) => {
    const [pitch, setPitch] = useState(initialPitch);
    const [yaw, setYaw] = useState(initialYaw);
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        setIsDragging(true);
        setLastMousePos({ x: e.clientX, y: e.clientY });
    }, []);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;

        setYaw(prev => prev + dx * 0.005);
        setPitch(prev => clamp(prev - dy * 0.005, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1));

        setLastMousePos({ x: e.clientX, y: e.clientY });
    }, [isDragging, lastMousePos]);

    const onMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    return { pitch, yaw, onMouseDown, onMouseMove, onMouseUp };
};