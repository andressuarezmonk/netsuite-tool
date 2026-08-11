import { DAYS } from "../utils/constants";
import { addDays, hoursToNS } from "../utils/dates";
import { DeleteService } from "./delete.service";
import { SaveService } from "./save.service";
import type { SaveRowParams } from "../utils/types";

/** Delete all time records for a row (pass all timeid values from its days). */
export async function deleteRow(timeids: string[]): Promise<void> {
  const ids = timeids.filter((id) => id.trim() !== "");
  if (ids.length === 0) return; // nothing saved yet — just remove from UI

  await DeleteService.deleteRow(ids);
}

export async function saveRow(
  params: SaveRowParams,
  userId: string,
  defaultItemId: string,
): Promise<void> {
  const { projRaw, taskRaw, itemId, weekISO, dayKey, hours, memo, timeid } =
    params;

  const projNumeric = projRaw.split("|")[0];
  const taskNumeric = taskRaw.split("|")[0];
  const dayIndex = DAYS.indexOf(dayKey);

  // Send the actual display date — the NS server takes the real date directly.
  // No DATE_SHIFT applied on save (shift is only for reading API responses).
  const actualDateISO = addDays(weekISO, dayIndex);
  const [y, m, d] = actualDateISO.split("-");
  const dayDate = `${parseInt(m)}/${parseInt(d)}/${y}`;

  const items = await SaveService.saveRow({
    emp: userId,
    proj: projNumeric,
    projtask: taskNumeric,
    item: itemId || defaultItemId,
    isbillable: false,
    class: null,
    location: null,
    department: null,
    rate: "1.00",
    blockid: 1,
    lines: [
      {
        day: dayKey,
        date: dayDate,
        time: hoursToNS(hours),
        memo: memo || "",
        timeid: timeid || "",
      },
    ],
  });

  let anySaved = false;
  for (const item of items) {
    if (
      item.errors &&
      item.errors !== "" &&
      item.errors !== "Saving success."
    ) {
      throw new Error(item.errors);
    }
    if (
      (item.created && item.created.length > 0) ||
      (item.updated && item.updated.length > 0)
    ) {
      anySaved = true;
    }
  }

  if (!anySaved) {
    throw new Error(
      "Server accepted the request but did not save the record. Please try again.",
    );
  }
}

export const RowService = { deleteRow, saveRow };
