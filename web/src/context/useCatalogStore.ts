import { useState } from "react";
import type { Project, Task } from "@/utils/types";

export interface Catalog {
  projects: Project[];
  tasks: Record<string, Task[]>;
}

export function useCatalogStore() {
  const [catalog, setCatalog] = useState<Catalog>({
    projects: [],
    tasks: {},
  });

  return { catalog, setCatalog };
}

export type CatalogStore = ReturnType<typeof useCatalogStore>;
