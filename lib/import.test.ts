import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRows, parseDate, parseStatus, parseType } from "./import.ts";

test("matches loose column names", () => {
  const { rows, problems, unmatched } = mapRows([
    { "Sail #": "USA 1234", "Boat": "Windward", "Design": "J/105", "Owner": "Olive", "E-mail": "Olive <Olive@Example.com>",
      "Date Received": "3/1/2025", "Status": "Approved", "PHRF Rating": "+87", "Drive folder": "https://drive.google.com/x", "Hull color": "blue" },
  ]);
  assert.equal(problems.length, 0);
  assert.deepEqual(unmatched, ["Hull color"]);
  const r = rows[0];
  assert.equal(r.sail_number, "USA 1234");
  assert.equal(r.boat_name, "Windward");
  assert.equal(r.model, "J/105");
  assert.equal(r.owner_email, "olive@example.com");
  assert.equal(r.received_on, "2025-03-01");
  assert.equal(r.status, "rated");
  assert.equal(r.rating, "87");
  assert.equal(r.folder_url, "https://drive.google.com/x");
  assert.deepEqual(r.extra, { "Hull color": "blue" });
});

test("a row needs a sail number or a boat name; a bad rating is an error", () => {
  const { problems } = mapRows([{ Owner: "Nobody", Rating: "fast" }]);
  const errors = problems.filter((p) => p.level === "error").map((p) => p.message);
  assert.equal(errors.length, 2);
});

test("a boat name without a sail number imports with a warning", () => {
  const { rows, problems } = mapRows([{ "Boat Name": "Gulf Breeze", Rating: "183" }]);
  assert.equal(rows[0].sail_number, "");
  assert.equal(problems.length, 1);
  assert.equal(problems[0].level, "warning");
  assert.match(problems[0].message, /Sail # needed/);
});

test("rated without a rating becomes received", () => {
  const { rows, problems } = mapRows([{ "Sail Number": "42", Status: "rated" }]);
  assert.equal(rows[0].status, "received");
  assert.equal(problems[0].level, "warning");
});

test("a rating with no status counts as rated", () => {
  const { rows } = mapRows([{ "Sail Number": "42", Rating: "-6" }]);
  assert.equal(rows[0].status, "rated");
  assert.equal(rows[0].rating, "-6");
});

test("skips blank lines and spots duplicates", () => {
  const { rows, problems } = mapRows([
    { "Sail Number": "usa-1", Date: "2025-01-05" },
    { "Sail Number": "", Date: "" },
    { "Sail Number": "USA 1", Date: "1/5/25" },
  ]);
  assert.equal(rows.length, 2);
  assert.match(problems[0].message, /duplicate of row 1/);
});

test("parsers", () => {
  assert.equal(parseDate("2025-11-02"), "2025-11-02");
  assert.equal(parseDate("11/2/25"), "2025-11-02");
  assert.equal(parseDate("March 4, 2025"), "2025-03-04");
  assert.equal(parseDate("someday"), null);
  assert.equal(parseStatus("Pending"), "received");
  assert.equal(parseStatus("waiting on owner for sail sheet"), "needs_info");
  assert.equal(parseType("Re-rate after new sails"), "change");
  assert.equal(parseType("Annual renewal"), "renewal");
});
