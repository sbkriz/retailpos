import React, { ReactNode, createContext, useContext, useMemo, useState, Dispatch, SetStateAction } from 'react';

/**
 * PanelStateProvider - Manages panel visibility state
 * Separate from basket state to avoid unnecessary re-renders
 */

interface PanelStateContextType {
  isRightPanelOpen: boolean;
  setIsRightPanelOpen: Dispatch<SetStateAction<boolean>>;
}

const PanelStateContext = createContext<PanelStateContextType | null>(null);

export const PanelStateProvider = ({ children }: { children: ReactNode }) => {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  const value = useMemo(
    () => ({
      isRightPanelOpen,
      setIsRightPanelOpen,
    }),
    [isRightPanelOpen]
  );

  return <PanelStateContext.Provider value={value}>{children}</PanelStateContext.Provider>;
};

export const usePanelState = (): PanelStateContextType => {
  const context = useContext(PanelStateContext);
  if (!context) {
    throw new Error('usePanelState must be used within PanelStateProvider');
  }
  return context;
};
