import * as vscode from "vscode";
import type { SetDayHoursParams, WeekResult } from "@protocol";
import { RepositoryError, type WeekRepository } from "@/data/weekRepository";
import { addDays, getMondayISO, todayISO } from "@/utils/dates";

import type { ViewState } from "@/model/weekViewModel";

export type { ViewState };

const STALE_AFTER_MS = 60_000;
const DAYS_PER_WEEK = 7;

export class WeekStore implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly statusSubscription: vscode.Disposable;
  private loadSequence = 0;
  private lastLoadedAt = 0;
  // Saves and deletes run one at a time, so a response can never be built
  // from a week that is missing an earlier, still-in-flight change.
  private mutationQueue: Promise<unknown> = Promise.resolve();

  readonly onDidChange = this.changeEmitter.event;

  mondayISO = getMondayISO(todayISO());
  week: WeekResult | null = null;
  viewState: ViewState = "loading";
  errorMessage = "";
  /** Last loaded copy of the real current week — drives the status bar. */
  currentWeek: WeekResult | null = null;

  constructor(private readonly repository: WeekRepository) {
    this.statusSubscription = repository.onDidChangeStatus(() => {
      void this.refresh();
    });
  }

  get accountOrigin(): string | null {
    return this.repository.accountOrigin;
  }

  get isCurrentWeek(): boolean {
    return this.mondayISO === getMondayISO(todayISO());
  }

  /** Reloads the displayed week. Keeps showing the old data while it loads. */
  async refresh(): Promise<void> {
    const requestedMondayISO = this.mondayISO;
    const sequence = ++this.loadSequence;

    if (this.repository.status !== "connected") {
      this.showWithoutWeek(this.repository.status);
      return;
    }
    if (!this.week) this.setViewState("loading");

    try {
      const loadedWeek = await this.repository.getWeek(requestedMondayISO);
      if (sequence !== this.loadSequence) return; // superseded by a newer load
      this.applyWeek(loadedWeek);
    } catch (error) {
      if (sequence !== this.loadSequence) return;
      this.applyError(error);
    }
  }

  async goToWeek(mondayISO: string): Promise<void> {
    this.mondayISO = mondayISO;
    this.week = null;
    this.setViewState("loading");
    await this.refresh();
  }

  goToRelativeWeek(offsetInWeeks: number): Promise<void> {
    return this.goToWeek(
      addDays(this.mondayISO, offsetInWeeks * DAYS_PER_WEEK),
    );
  }

  goToCurrentWeek(): Promise<void> {
    return this.goToWeek(getMondayISO(todayISO()));
  }

  /** Refreshes when the data is old, or when we aren't showing any yet. */
  async refreshIfStale(): Promise<void> {
    const isStale = Date.now() - this.lastLoadedAt > STALE_AFTER_MS;
    if (this.viewState !== "ready" || isStale) await this.refresh();
  }

  /** Saves a day's hours. Throws on failure so the caller can tell the user. */
  setDayHours(params: Omit<SetDayHoursParams, "mondayISO">): Promise<void> {
    return this.runMutation((mondayISO) =>
      this.repository.setDayHours({ ...params, mondayISO }),
    );
  }

  /** Deletes the records behind a row. Throws on failure. */
  deleteRow(timeids: string[]): Promise<void> {
    return this.runMutation((mondayISO) =>
      this.repository.deleteRow({ mondayISO, timeids }),
    );
  }

  dispose(): void {
    this.statusSubscription.dispose();
    this.changeEmitter.dispose();
  }

  private runMutation(
    mutation: (mondayISO: string) => Promise<WeekResult>,
  ): Promise<void> {
    const result = this.mutationQueue.then(() => this.applyMutation(mutation));
    this.mutationQueue = result.catch(() => undefined);
    return result;
  }

  private async applyMutation(
    mutation: (mondayISO: string) => Promise<WeekResult>,
  ): Promise<void> {
    const requestedMondayISO = this.mondayISO;
    try {
      const updatedWeek = await mutation(requestedMondayISO);
      this.rememberIfCurrentWeek(updatedWeek);
      // The user may have navigated to another week while this saved
      if (requestedMondayISO === this.mondayISO) this.applyWeek(updatedWeek);
      else this.changeEmitter.fire();
    } catch (error) {
      if (
        error instanceof RepositoryError &&
        error.code === "SESSION_EXPIRED"
      ) {
        this.applyError(error);
      }
      throw error;
    }
  }

  private applyWeek(loadedWeek: WeekResult): void {
    this.week = loadedWeek;
    this.errorMessage = "";
    this.lastLoadedAt = Date.now();
    this.rememberIfCurrentWeek(loadedWeek);
    this.setViewState("ready");
  }

  private rememberIfCurrentWeek(loadedWeek: WeekResult): void {
    if (loadedWeek.mondayISO === getMondayISO(todayISO())) {
      this.currentWeek = loadedWeek;
    }
  }

  private applyError(error: unknown): void {
    this.week = null;
    if (error instanceof RepositoryError) {
      switch (error.code) {
        case "NOT_CONNECTED":
          return this.setViewState("waiting");
        case "SESSION_EXPIRED":
          return this.setViewState("sessionExpired");
        case "NOT_CONFIGURED":
          return this.setViewState("notConfigured");
      }
    }
    this.errorMessage = error instanceof Error ? error.message : String(error);
    this.setViewState("error");
  }

  private showWithoutWeek(state: "notPaired" | "waiting" | "portInUse"): void {
    this.week = null;
    this.setViewState(state);
  }

  private setViewState(state: ViewState): void {
    this.viewState = state;
    this.changeEmitter.fire();
  }
}
