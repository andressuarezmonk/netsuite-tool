import { useState } from "react";
import { TargetService, isValidWeeklyTarget } from "@/services/target.service";

export function useWeeklyTarget() {
  const [weeklyTarget, setWeeklyTargetState] = useState<number>(() =>
    TargetService.get(),
  );

  const setWeeklyTarget = (hours: number) => {
    if (!isValidWeeklyTarget(hours)) return;
    TargetService.set(hours);
    setWeeklyTargetState(hours);
  };

  return { weeklyTarget, setWeeklyTarget };
}
