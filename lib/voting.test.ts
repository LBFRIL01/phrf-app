import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeVotes } from "./voting.ts";

test("no votes", () => {
  const s = summarizeVotes([], 3);
  assert.equal(s.cast, 0);
  assert.equal(s.median, null);
  assert.equal(s.quorumMet, false);
  assert.equal(s.agreement, false);
});

test("odd number of votes uses the middle value", () => {
  const s = summarizeVotes(
    [{ proposed_rating: 90, recused: false }, { proposed_rating: 84, recused: false }, { proposed_rating: 87, recused: false }],
    3,
  );
  assert.equal(s.median, 87);
  assert.equal(s.low, 84);
  assert.equal(s.high, 90);
  assert.equal(s.quorumMet, true);
  assert.equal(s.agreement, true);
});

test("even number of votes averages the middle two", () => {
  const s = summarizeVotes([{ proposed_rating: 80, recused: false }, { proposed_rating: 85, recused: false }], 3);
  assert.equal(s.median, 83); // 82.5 rounds to 83
  assert.equal(s.quorumMet, false);
});

test("recused members do not count", () => {
  const s = summarizeVotes(
    [{ proposed_rating: 90, recused: false }, { proposed_rating: null, recused: true }, { proposed_rating: 120, recused: false }],
    2,
  );
  assert.equal(s.cast, 2);
  assert.equal(s.recused, 1);
  assert.equal(s.quorumMet, true);
  assert.equal(s.agreement, false);
});

test("negative ratings (fast boats) work", () => {
  const s = summarizeVotes([{ proposed_rating: -12, recused: false }, { proposed_rating: -9, recused: false }, { proposed_rating: -15, recused: false }], 3);
  assert.equal(s.median, -12);
});
