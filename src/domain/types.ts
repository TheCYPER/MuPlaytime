export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type RoomId = Brand<string, "RoomId">;
export type MemberId = Brand<string, "MemberId">;
export type ScheduleSetId = Brand<string, "ScheduleSetId">;
export type ProposalId = Brand<string, "ProposalId">;
export type OptionId = Brand<string, "OptionId">;
export type WatchId = Brand<string, "WatchId">;

export type ScheduleState = "free" | "busy";
export type MemberStatus = ScheduleState | "unknown";
export type ResponseChoice = "accept" | "decline" | "maybe";
export type ProposalStatus = "open" | "scheduled" | "cancelled";
export type WatchCloseReason =
  "option_withdrawn" | "not_selected" | "proposal_cancelled";

export interface Member {
  id: MemberId;
  roomId: RoomId;
  displayName: string;
  normalizedName: string;
  createdAt: string;
}

export interface ScheduleInterval {
  startMinute: number;
  endMinute: number;
  state: ScheduleState;
}

export interface WeeklyInterval extends ScheduleInterval {
  isoWeekday: number;
}

export interface DateOverride {
  localDate: string;
  version: number;
  intervals: ScheduleInterval[];
}

export interface ScheduleSet {
  id: ScheduleSetId;
  roomId: RoomId;
  memberId: MemberId;
  timeZone: string;
  version: number;
  weekly: WeeklyInterval[];
  overrides: DateOverride[];
}

export interface ProposalOption {
  id: OptionId;
  roomId: RoomId;
  proposalId: ProposalId;
  suggestedByMemberId: MemberId;
  startsAt: string;
  durationMinutes: number;
  sourceTimeZone: string;
  sourceLocalStart: string;
  sourceOffset: string;
  withdrawnAt: string | null;
}

export interface ResponseRecord {
  roomId: RoomId;
  optionId: OptionId;
  memberId: MemberId;
  response: ResponseChoice;
  withdrawnAt: string | null;
  updatedAt: string;
}

export interface ThresholdWatch {
  id: WatchId;
  roomId: RoomId;
  optionId: OptionId;
  memberId: MemberId;
  threshold: number;
  triggeredAt: string | null;
  acknowledgedAt: string | null;
  closedAt: string | null;
  closeReason: WatchCloseReason | null;
  createdAt: string;
}

export interface Proposal {
  id: ProposalId;
  roomId: RoomId;
  createdByMemberId: MemberId;
  gameName: string;
  status: ProposalStatus;
  confirmedOptionId: OptionId | null;
  createdAt: string;
  options: ProposalOption[];
  responses: ResponseRecord[];
  watches: ThresholdWatch[];
}

export interface RoomSnapshot {
  roomId: RoomId;
  roomName: string;
  currentMemberId: MemberId;
  members: Member[];
  schedules: ScheduleSet[];
  proposals: Proposal[];
  changeSequence: number;
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
