import type { SupabaseClient } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { roomKeys } from "../data/query";
import type { RoomRepository } from "../data/repository";
import { I18nProvider } from "../i18n/I18nProvider";
import { roomSnapshotFixture } from "../test/roomSnapshot";
import { RoomPage } from "./RoomPage";

const originalMatchMedia = window.matchMedia?.bind(window);

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
  document.getElementById("modal-root")?.remove();
  document.getElementById("root")?.remove();
});

function compactMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 840px)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderMutationRoom(repository: RoomRepository) {
  const snapshot = roomSnapshotFixture();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  const supabase = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  } as unknown as SupabaseClient;
  const appRoot = document.createElement("div");
  appRoot.id = "root";
  document.body.append(appRoot);
  const modalRoot = document.createElement("div");
  modalRoot.id = "modal-root";
  document.body.append(modalRoot);
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RoomPage
          roomId={snapshot.roomId}
          view="schedule"
          repository={repository}
          supabase={supabase}
          viewerTimeZone="Asia/Shanghai"
          onViewerTimeZone={vi.fn()}
          inviteToken={null}
        />
      </I18nProvider>
    </QueryClientProvider>,
    { container: appRoot },
  );
  return snapshot;
}

describe("RoomPage cached refetch failures", () => {
  it("keeps an open schedule draft mounted and offers retry", async () => {
    const snapshot = roomSnapshotFixture();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(roomKeys.snapshot(snapshot.roomId), snapshot);
    const snapshotRequest = vi
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValue(new Error("background refetch failed"));
    const repository = {
      snapshot: snapshotRequest,
    } as unknown as RoomRepository;
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    } as unknown as SupabaseClient;

    const appRoot = document.createElement("div");
    appRoot.id = "root";
    document.body.append(appRoot);
    const modalRoot = document.createElement("div");
    modalRoot.id = "modal-root";
    document.body.append(modalRoot);
    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <RoomPage
            roomId={snapshot.roomId}
            view="schedule"
            repository={repository}
            supabase={supabase}
            viewerTimeZone="Asia/Shanghai"
            onViewerTimeZone={vi.fn()}
            inviteToken={null}
          />
        </I18nProvider>
      </QueryClientProvider>,
      { container: appRoot },
    );
    await waitFor(() => expect(snapshotRequest).toHaveBeenCalledOnce());
    fireEvent.click(screen.getAllByRole("button", { name: "Add time" })[0]!);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Start"), {
      target: { value: "16:30" },
    });

    await queryClient.invalidateQueries({
      queryKey: roomKeys.snapshot(snapshot.roomId),
    });

    expect(
      await within(dialog).findByText(
        /could not reach the shared room service/,
      ),
    ).toBeVisible();
    const retry = within(dialog).getByRole("button", { name: "Retry" });
    expect(retry).toBeVisible();
    expect(within(dialog).getByLabelText("Start")).toHaveValue("16:30");
    expect(dialog).toBeVisible();
    const requestsBeforeRetry = snapshotRequest.mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() =>
      expect(snapshotRequest.mock.calls.length).toBeGreaterThan(
        requestsBeforeRetry,
      ),
    );
    expect(within(dialog).getByLabelText("Start")).toHaveValue("16:30");
  });
});

describe("RoomPage live mutation callbacks", () => {
  it("saves an interval opened offline after reconnect without a stale callback", async () => {
    const online = vi
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(false);
    const snapshot = roomSnapshotFixture();
    const replaceWeeklyDay = vi.fn().mockResolvedValue(snapshot);
    const repository = {
      snapshot: vi.fn().mockResolvedValue(snapshot),
      replaceWeeklyDay,
    } as unknown as RoomRepository;
    renderMutationRoom(repository);
    await screen.findByRole("heading", { name: "My schedule" });

    fireEvent.click(screen.getAllByRole("button", { name: "Add time" })[0]!);
    const dialog = screen.getByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save changes" });
    expect(within(dialog).getByText(/Offline/)).toBeVisible();
    expect(save).toBeDisabled();

    online.mockReturnValue(true);
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(replaceWeeklyDay).toHaveBeenCalledOnce());
    expect(replaceWeeklyDay).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: snapshot.roomId,
        intervals: [{ startMinute: 1080, endMinute: 1200, state: "free" }],
        expectedVersion: 3,
      }),
    );
  });

  it("migrates from a timezone sheet opened offline after reconnect", async () => {
    compactMatchMedia();
    const online = vi
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(false);
    const snapshot = roomSnapshotFixture();
    const migrateScheduleZone = vi.fn().mockResolvedValue(snapshot);
    const repository = {
      snapshot: vi.fn().mockResolvedValue(snapshot),
      migrateScheduleZone,
    } as unknown as RoomRepository;
    renderMutationRoom(repository);
    await screen.findByRole("heading", { name: "My schedule" });

    fireEvent.click(screen.getByRole("tab", { name: "Timezone" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Review timezone change" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Timezone"), {
      target: { value: "America/New_York" },
    });
    fireEvent.click(
      within(dialog).getByLabelText(/Migrate schedule and preserve/),
    );
    const confirm = within(dialog).getByRole("button", {
      name: "Confirm migration",
    });
    expect(confirm).toBeDisabled();

    online.mockReturnValue(true);
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(migrateScheduleZone).toHaveBeenCalledOnce());
    expect(migrateScheduleZone).toHaveBeenCalledWith({
      roomId: snapshot.roomId,
      timeZone: "America/New_York",
      expectedVersion: 3,
    });
  });
});
