import type {
  MemberId,
  OptionId,
  Proposal,
  ProposalOption,
  ResponseChoice,
  ResponseRecord,
  ThresholdWatch,
} from "./types";

export function isOptionResponseEligible(
  proposal: Proposal,
  option: ProposalOption,
): boolean {
  if (proposal.status === "cancelled" || option.withdrawnAt !== null)
    return false;
  if (proposal.status === "open") return true;
  return proposal.confirmedOptionId === option.id;
}

export function activeResponses(
  responses: readonly ResponseRecord[],
  optionId: OptionId,
): ResponseRecord[] {
  return responses.filter(
    (response) =>
      response.optionId === optionId && response.withdrawnAt === null,
  );
}

export function responseTotals(
  responses: readonly ResponseRecord[],
  optionId: OptionId,
): Record<ResponseChoice, number> {
  const totals: Record<ResponseChoice, number> = {
    accept: 0,
    decline: 0,
    maybe: 0,
  };
  for (const response of activeResponses(responses, optionId)) {
    totals[response.response] += 1;
  }
  return totals;
}

export function currentResponse(
  responses: readonly ResponseRecord[],
  optionId: OptionId,
  memberId: MemberId,
): ResponseChoice | null {
  return (
    responses.find(
      (response) =>
        response.optionId === optionId &&
        response.memberId === memberId &&
        response.withdrawnAt === null,
    )?.response ?? null
  );
}

export function watchPresentation(
  watch: ThresholdWatch,
): "watching" | "triggered" | "acknowledged" | "expired" {
  if (watch.acknowledgedAt !== null) return "acknowledged";
  if (watch.triggeredAt !== null) return "triggered";
  if (watch.closedAt !== null) return "expired";
  return "watching";
}

export function selectPresentedWatch(
  watches: readonly ThresholdWatch[],
  optionId: OptionId,
  memberId: MemberId,
): ThresholdWatch | null {
  const priority = (watch: ThresholdWatch): number => {
    if (watch.acknowledgedAt !== null) return 0;
    if (watch.triggeredAt !== null) return 3;
    if (watch.closedAt === null) return 2;
    return 1;
  };
  return (
    watches
      .filter(
        (watch) => watch.optionId === optionId && watch.memberId === memberId,
      )
      .filter((watch) => watch.acknowledgedAt === null)
      .sort((left, right) => {
        const byPriority = priority(right) - priority(left);
        return byPriority !== 0
          ? byPriority
          : Date.parse(right.createdAt) - Date.parse(left.createdAt);
      })[0] ?? null
  );
}
