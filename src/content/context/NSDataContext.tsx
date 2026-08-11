import { createContext, useContext, useState, type ReactNode } from "react";
import type { Project, Task } from "@/content/utils/types";

export interface NSDataState {
  userId: string;
  defaultItemId: string;
  projects: Project[];
  tasks: Record<string, Task[]>;
}

export interface NSDataActions {
  setUserId: (userId: string) => void;
  setDefaultItemId: (defaultItemId: string) => void;
  setProjects: (projects: Project[]) => void;
  setTasks: (tasks: Record<string, Task[]>) => void;
}

export const NSDataStateContext = createContext<NSDataState | null>(null);
export const NSDataActionsContext = createContext<NSDataActions | null>(null);

export function NSDataProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState("");
  const [defaultItemId, setDefaultItemId] = useState("754");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});

  const stateValue: NSDataState = { userId, defaultItemId, projects, tasks };
  const actionsValue: NSDataActions = {
    setUserId,
    setDefaultItemId,
    setProjects,
    setTasks,
  };

  return (
    <NSDataStateContext.Provider value={stateValue}>
      <NSDataActionsContext.Provider value={actionsValue}>
        {children}
      </NSDataActionsContext.Provider>
    </NSDataStateContext.Provider>
  );
}

export function useNSData(): NSDataState {
  const ctx = useContext(NSDataStateContext);
  if (!ctx) throw new Error("useNSData must be used inside NSDataProvider");
  return ctx;
}

export function useNSDataActions(): NSDataActions {
  const ctx = useContext(NSDataActionsContext);
  if (!ctx)
    throw new Error("useNSDataActions must be used inside NSDataProvider");
  return ctx;
}
