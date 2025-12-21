import { createContext, useContext, ReactNode } from 'react';

interface NavMeshContextValue {
  navMesh: any | null;
  isGenerating: boolean;  offMeshConnections?: any[];}

const NavMeshContext = createContext<NavMeshContextValue | null>(null);

export const useNavMesh = () => {
  const context = useContext(NavMeshContext);
  if (!context) {
    throw new Error('useNavMesh must be used within a NavMeshProvider');
  }
  return context;
};

export const NavMeshProvider = ({
  children,
  navMesh,
  isGenerating,
  offMeshConnections,
}: {
  children: ReactNode;
  navMesh: any | null;
  isGenerating: boolean;
  offMeshConnections?: any[];
}) => {
  return (
    <NavMeshContext.Provider value={{ navMesh, isGenerating, offMeshConnections }}>
      {children}
    </NavMeshContext.Provider>
  );
};
