import type { TimeRow } from "@/content/utils/types";

// Props still passed explicitly (local/derived data, not from context)

export interface TotalsProps {
  rows: TimeRow[];
  dayDates: string[];
  today: string;
}
