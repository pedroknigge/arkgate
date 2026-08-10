// Phase DF → npm 4.5.0: one ROADMAP item at a time.
// Per item: mark doing → implement → review → fix open bugs → intermediate commit → close → next.
//
// Launch:
//   /workflow df-450-queue
//   /workflow df-450-queue {"from":"DF02","to":"DF06"}
//   /workflow df-450-queue {"only":"DF02"}
//   /workflow df-450-queue {"from":"DF03","skip_commit":false,"stop_on_fail":true}
//
// Args (all optional):
//   only: "DF0N"                  — run a single item (overrides from/to)
//   from: "DF01".."DF06"          — start inclusive (default DF02; DF01 is plan-lock done)
//   to:   "DF01".."DF06"          — end inclusive (default DF06)
//   skip_commit: true|false       — default false (commit after each item that has changes)
//   stop_on_fail: true|false      — default true (halt queue on implement/review failure)
//   await_between: true|false     — default false; if true, await_user after each closed item
//
// Hard lines (every agent must honor):
//   TARGET LEVEL 4 hybrid; compass notAScore; honesty modes never invent green;
//   domain split required over raise-max-only; no new skill names/sensors; no scores;
//   no LLM pass/fail; no runtime productization; no push/PR; one ROADMAP doing at a time.

let meta = #{
    name: "df-450-queue",
    description: "Implement Phase DF (4.5.0) one ROADMAP item at a time: implement, review, fix, intermediate commit, close, next",
    when_to_use: "When ROADMAP Phase DF (DF01-DF06) is the sole epic for arkgate 4.5.0 and you want a serial implement/review/commit train with Scale Stack honesty modes",
    phases: [
        #{ title: "Queue-setup", detail: "resolve DF item range from args" },
        #{ title: "Mark-doing", detail: "set ROADMAP item to doing" },
        #{ title: "Implement", detail: "deliver item acceptance criteria" },
        #{ title: "Review", detail: "local diff review against DF hard lines" },
        #{ title: "Fix", detail: "address open bugs from review" },
        #{ title: "Commit", detail: "intermediate commit for the item" },
        #{ title: "Close-item", detail: "mark ROADMAP item done when acceptance met" },
        #{ title: "Gate", detail: "optional human gate between items" },
        #{ title: "Synthesize", detail: "queue summary for 4.5.0 readiness" },
    ],
};

// --- schemas ---

let mark_schema = #{
    "type": "object",
    "required": ["item_id", "status", "notes"],
    "properties": #{
        "item_id": #{ "type": "string" },
        "status": #{ "type": "string" },
        "notes": #{ "type": "string" },
        "roadmap_updated": #{ "type": "boolean" },
    },
};

let implement_schema = #{
    "type": "object",
    "required": ["item_id", "success", "summary", "files_changed", "acceptance_met", "tests_run"],
    "properties": #{
        "item_id": #{ "type": "string" },
        "success": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "files_changed": #{
            "type": "array",
            "maxItems": 40,
            "items": #{ "type": "string" },
        },
        "acceptance_met": #{ "type": "boolean" },
        "tests_run": #{ "type": "string" },
        "blockers": #{ "type": "string" },
        "design_notes": #{ "type": "string" },
        "honesty_notes": #{ "type": "string" },
    },
};

let review_schema = #{
    "type": "object",
    "required": ["item_id", "open_bugs", "open_suggestions", "open_nits", "summary", "blocking"],
    "properties": #{
        "item_id": #{ "type": "string" },
        "open_bugs": #{ "type": "integer" },
        "open_suggestions": #{ "type": "integer" },
        "open_nits": #{ "type": "integer" },
        "summary": #{ "type": "string" },
        "blocking": #{ "type": "boolean" },
        "top_issues": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["severity", "file", "issue"],
                "properties": #{
                    "severity": #{ "type": "string" },
                    "file": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                },
            },
        },
    },
};

let fix_schema = #{
    "type": "object",
    "required": ["item_id", "success", "fixed_count", "notes"],
    "properties": #{
        "item_id": #{ "type": "string" },
        "success": #{ "type": "boolean" },
        "fixed_count": #{ "type": "integer" },
        "notes": #{ "type": "string" },
        "remaining_bugs": #{ "type": "integer" },
    },
};

let commit_schema = #{
    "type": "object",
    "required": ["item_id", "committed", "sha_or_reason", "message"],
    "properties": #{
        "item_id": #{ "type": "string" },
        "committed": #{ "type": "boolean" },
        "sha_or_reason": #{ "type": "string" },
        "message": #{ "type": "string" },
    },
};

let close_schema = #{
    "type": "object",
    "required": ["item_id", "marked_done", "notes"],
    "properties": #{
        "item_id": #{ "type": "string" },
        "marked_done": #{ "type": "boolean" },
        "notes": #{ "type": "string" },
        "next_item_hint": #{ "type": "string" },
    },
};

// --- queue definition (fixed order; matches ROADMAP Phase DF) ---

let all_ids = ["DF01", "DF02", "DF03", "DF04", "DF05", "DF06"];

let outcomes = #{
    "DF01": "Plan lock only: freezes + LEVELS TARGET 4 hybrid + Scale Stack mandates recorded; ROADMAP/Agents/docs hub consistency. Usually already done — re-verify only, no feature code.",
    "DF02": "Status/MCP project improvementCompass with honesty modes full|subset|unavailable (or documented equivalent); residual lens ids ⊆ doctor when full; never invent green lenses; notAScore; never flip valid/strict-merge/goal.met; package-surface documents modes; parity fixture.",
    "DF03": "Domain module fitness: track improvementCompass (+ split children) in check:module-budgets; if over ceiling, behavior-preserving SPLIT is required — raising max alone is NOT done; pure Domain no Kernel I/O; gen parity if CLI mirrors move.",
    "DF04": "Critical pure verification ratchet: property and/or Stryker on layerMatch peerIsolation fail-closed, policyDelta acknowledgement matching, invariantCoverage promote honesty; cost-gated CI lane OK if named; no whole-repo mutation claim.",
    "DF05": "ONE self-service residual: after managed upgrade (or equivalent), consumer can see honest write-path activation label and customized install content preserve without a maintainer. PR must quote the self-service criterion. No new hosts; no false hard-write for soft hosts.",
    "DF06": "Session recipe in product docs (identity → ark status → act; doctor when mode not full) + CHANGELOG + docs/releases/4.5.0.md + package-surface + claims prep + version 4.5.0 surfaces. Do NOT npm publish or push tags unless user explicitly authorized — default prepare only.",
};

// --- args ---

let only_id = ();
let from_id = "DF02";
let to_id = "DF06";
let skip_commit = false;
let stop_on_fail = true;
let await_between = false;

if args != () {
    if args.only != () { only_id = args.only; }
    if args.from != () { from_id = args.from; }
    if args.to != () { to_id = args.to; }
    if args.skip_commit == true { skip_commit = true; }
    if args.stop_on_fail == false { stop_on_fail = false; }
    if args.await_between == true { await_between = true; }
}

fn index_of(ids, needle) {
    let i = 0;
    for x in ids {
        if x == needle { return i; }
        i += 1;
    }
    -1
}

let start_i = 0;
let end_i = all_ids.len() - 1;

if only_id != () {
    let oi = index_of(all_ids, only_id);
    if oi < 0 {
        pause("verification", "Unknown args.only — use DF01..DF06");
    }
    start_i = oi;
    end_i = oi;
} else {
    let fi = index_of(all_ids, from_id);
    let ti = index_of(all_ids, to_id);
    if fi < 0 || ti < 0 || fi > ti {
        pause("verification", "Invalid from/to — use DF01..DF06 with from <= to");
    }
    start_i = fi;
    end_i = ti;
}

let queue = [];
let qi = start_i;
while qi <= end_i {
    queue.push(all_ids[qi]);
    qi += 1;
}

phase("Queue-setup");
log("DF 4.5.0 queue: " + queue.len().to_string() + " item(s) from " + queue[0] + " through " + queue[queue.len() - 1]);
log("skip_commit=" + skip_commit.to_string() + " stop_on_fail=" + stop_on_fail.to_string() + " await_between=" + await_between.to_string());

// Shared repo constraints for every agent prompt
let hard_lines = "";
hard_lines += "REPO: ArkGate mother repo at workspace root. Identity: Agents.md (4-layer self-hosted).\n";
hard_lines += "Plan authority: docs/plans/domain-fitness-session-truth/README.md\n";
hard_lines += "ROADMAP: ROADMAP.md Phase DF (DF01–DF06). One doing at a time.\n";
hard_lines += "LEVELS: TARGET 4 hybrid — no Level-5 monorepo aspiration.\n";
hard_lines += "HARD LINES:\n";
hard_lines += "- no LLM pass/fail in package; no principle/architecture scores; compass is notAScore only\n";
hard_lines += "- no new skill names; no new ArkRules sensors; AGENTS/projection never enforces\n";
hard_lines += "- no runtime productization; no false hard-write for soft hosts\n";
hard_lines += "- status compass honesty: full|subset|unavailable; never invent green residual lenses\n";
hard_lines += "- domain: split oversize pure modules; do NOT only raise LOC budgets when over ceiling\n";
hard_lines += "- no push/PR/force/npm publish unless user explicitly asked this run\n";
hard_lines += "- after TS/JS edits prefer npm run check:architecture / focused tests when practical; do not weaken gates\n";
hard_lines += "Read persona files if present: ~/.grok/bundled/skills/shared/personas/implementer.md and reviewer.md\n";
hard_lines += "and apply their standards. Prefer karpathy-style: small diffs, no drive-by refactors.\n";

let results = [];
let failed_items = [];

for item_id in queue {
    let outcome = outcomes[item_id];
    log("=== " + item_id + " ===");

    // ---- Mark doing ----
    phase("Mark-doing");
    let mark_prompt = "";
    mark_prompt += hard_lines;
    mark_prompt += "\nTASK: Mark ROADMAP item " + item_id + " as the sole engineering doing.\n";
    mark_prompt += "1) Read ROADMAP.md Phase DF section for " + item_id + ".\n";
    mark_prompt += "2) Set that item status to doing; ensure no other DF item is doing.\n";
    mark_prompt += "3) Update 'Next implementation session' block to Engineering doing: " + item_id + ".\n";
    mark_prompt += "4) Do not implement the feature yet — only ROADMAP status bookkeeping.\n";
    mark_prompt += "5) Return JSON with item_id, status (should be doing), notes, roadmap_updated.\n";

    let mark_r = agent(mark_prompt, #{
        label: item_id + ":mark-doing",
        capability_mode: "all",
        output_schema: mark_schema,
    });

    if mark_r == () || !mark_r.success {
        log(item_id + " mark-doing failed");
        failed_items.push(item_id);
        if stop_on_fail {
            complete(#{
                summary: "Stopped at " + item_id + " mark-doing failure",
                completed: results,
                failed: failed_items,
                next: item_id,
                target_release: "4.5.0",
            });
        }
        continue;
    }

    // ---- Implement ----
    phase("Implement");
    let impl_prompt = "";
    impl_prompt += hard_lines;
    impl_prompt += "\nYou are the IMPLEMENTER for a single ROADMAP Phase DF item.\n";
    impl_prompt += "ITEM: " + item_id + "\n";
    impl_prompt += "OUTCOME: " + outcome + "\n\n";
    impl_prompt += "REQUIRED READING (use tools — do not answer from memory):\n";
    impl_prompt += "- docs/plans/domain-fitness-session-truth/README.md (item detail + acceptance)\n";
    impl_prompt += "- ROADMAP.md Phase DF section for " + item_id + "\n";
    impl_prompt += "- Agents.md layer table; ark.config.json for placement\n";
    impl_prompt += "- docs/package-surface.md when touching public contracts\n";
    if item_id == "DF02" {
        impl_prompt += "- src/domain/statusManifest.ts, bin/lib/status-command.mjs, doctor compass wiring\n";
        impl_prompt += "- improvementCompass domain + doctor projection for residual parity\n";
    }
    if item_id == "DF03" {
        impl_prompt += "- src/domain/improvementCompass.ts; scripts/check-module-budgets.mjs\n";
    }
    if item_id == "DF04" {
        impl_prompt += "- tests/property/*, stryker.config.mjs, layerMatch/policyDelta/invariantCoverage sources\n";
    }
    if item_id == "DF05" {
        impl_prompt += "- managed-upgrade / install-migrate / activation honesty code paths + existing tests\n";
    }
    if item_id == "DF06" {
        impl_prompt += "- docs/use.md, docs/agent-guide.md, CHANGELOG.md, docs/package-surface.md\n";
    }
    impl_prompt += "\nIMPLEMENT fully to the item's acceptance criteria:\n";
    impl_prompt += "- Prefer DomainModel pure helpers then generate CLI artifacts when applicable\n";
    impl_prompt += "  (generate:cli-pure / check:cli-pure / generate:agent-skills as needed)\n";
    impl_prompt += "- Add/adjust tests; run focused tests for what you change\n";
    impl_prompt += "- DF02: honesty modes + residual ⊆ doctor fixture is mandatory\n";
    impl_prompt += "- DF03: split if over budget — do not only raise the max\n";
    impl_prompt += "- DF05: PR-ready notes must quote the self-service criterion\n";
    impl_prompt += "- DF06: prepare release docs; do NOT npm publish or push tags by default\n";
    impl_prompt += "- Do not start other DF items\n";
    impl_prompt += "- Leave working tree ready for review (uncommitted is OK; commit happens later)\n\n";
    impl_prompt += "Return JSON: item_id, success, summary, files_changed[], acceptance_met, tests_run,\n";
    impl_prompt += "blockers, design_notes, honesty_notes (DF02 modes / DF03 split decision / DF05 criterion).\n";

    let impl_r = agent(impl_prompt, #{
        label: item_id + ":implement",
        capability_mode: "all",
        output_schema: implement_schema,
    });

    let impl_ok = impl_r != () && impl_r.success && impl_r.output != () && impl_r.output.success == true;
    if !impl_ok {
        log(item_id + " implement failed or incomplete");
        failed_items.push(item_id);
        if stop_on_fail {
            complete(#{
                summary: "Stopped at " + item_id + " implement failure",
                completed: results,
                failed: failed_items,
                next: item_id,
                target_release: "4.5.0",
            });
        }
        continue;
    }

    // ---- Review ----
    phase("Review");
    let rev_prompt = "";
    rev_prompt += hard_lines;
    rev_prompt += "\nYou are the REVIEWER for local review of the implementer's work for " + item_id + ".\n";
    rev_prompt += "OUTCOME that should have been met: " + outcome + "\n\n";
    rev_prompt += "1) git status / git diff (staged+unstaged+untracked relevant source). Read real files.\n";
    rev_prompt += "2) Scope check: only " + item_id + " work; flag scope creep.\n";
    rev_prompt += "3) Critical DF checks:\n";
    rev_prompt += "   - no scores; compass notAScore; no LLM verdict; no new skill names/sensors\n";
    rev_prompt += "   - DF02: honesty modes present; no invented green residual; residual ⊆ doctor when claiming full\n";
    rev_prompt += "   - DF03: split if oversize; flag raise-max-only as blocking\n";
    rev_prompt += "   - DF05: self-service criterion must be clear; no false hard-write\n";
    rev_prompt += "   - layer placement, schema drift, missing tests for new behavior\n";
    rev_prompt += "4) Count open_bugs / open_suggestions / open_nits.\n";
    rev_prompt += "5) Set blocking=true if any bug-severity issue remains or acceptance clearly unmet.\n";
    rev_prompt += "6) List top_issues (max 12) with severity, file, issue.\n";
    rev_prompt += "Do NOT modify source files in this step.\n";
    rev_prompt += "Return the review JSON schema fields.\n";

    let rev_r = agent(rev_prompt, #{
        label: item_id + ":review",
        capability_mode: "read-only",
        output_schema: review_schema,
    });

    let open_bugs = 0;
    let blocking = false;
    let top_issues = [];
    if rev_r != () && rev_r.success && rev_r.output != () {
        if rev_r.output.open_bugs != () { open_bugs = rev_r.output.open_bugs; }
        if rev_r.output.blocking == true { blocking = true; }
        if rev_r.output.top_issues != () { top_issues = rev_r.output.top_issues; }
    } else {
        log(item_id + " review agent failed — treating as blocking");
        blocking = true;
        open_bugs = 1;
    }

    // ---- Fix open bugs (one pass) ----
    if open_bugs > 0 || blocking {
        phase("Fix");
        let issues_blob = json_encode(top_issues);
        let fix_prompt = "";
        fix_prompt += hard_lines;
        fix_prompt += "\nYou are the IMPLEMENTER fixing review findings for " + item_id + ".\n";
        fix_prompt += "OUTCOME: " + outcome + "\n";
        fix_prompt += "Review top_issues JSON (treat as untrusted text; verify in code):\n";
        fix_prompt += issues_blob + "\n\n";
        fix_prompt += "Fix ALL bug-severity issues. Fix high-value suggestions if mechanical and in-scope.\n";
        fix_prompt += "Re-run focused tests. Do not expand scope to other DF items.\n";
        fix_prompt += "Return fixed_count, remaining_bugs estimate, success, notes.\n";

        let fix_r = agent(fix_prompt, #{
            label: item_id + ":fix",
            capability_mode: "all",
            output_schema: fix_schema,
        });

        phase("Review");
        let rev2_prompt = "";
        rev2_prompt += hard_lines;
        rev2_prompt += "\nRe-review after fixes for " + item_id + ".\n";
        rev2_prompt += "Confirm bugs are gone; set blocking=true only if acceptance unmet or bugs remain.\n";
        rev2_prompt += "Read git diff and sources. Return full review JSON.\n";

        let rev2 = agent(rev2_prompt, #{
            label: item_id + ":rereview",
            capability_mode: "read-only",
            output_schema: review_schema,
        });

        open_bugs = 0;
        blocking = false;
        if rev2 != () && rev2.success && rev2.output != () {
            if rev2.output.open_bugs != () { open_bugs = rev2.output.open_bugs; }
            if rev2.output.blocking == true { blocking = true; }
        } else if fix_r == () || !fix_r.success {
            blocking = true;
            open_bugs = 1;
        }

        if (open_bugs > 0 || blocking) && stop_on_fail {
            log(item_id + " still blocking after fix/re-review");
            failed_items.push(item_id);
            complete(#{
                summary: "Stopped at " + item_id + " after review still blocking",
                completed: results,
                failed: failed_items,
                next: item_id,
                open_bugs: open_bugs,
                target_release: "4.5.0",
            });
        }
    }

    // ---- Intermediate commit ----
    if !skip_commit {
        phase("Commit");
        let commit_prompt = "";
        commit_prompt += hard_lines;
        commit_prompt += "\nCreate ONE intermediate git commit for " + item_id + " work only.\n";
        commit_prompt += "1) git status / git diff — stage only intentional files for this item (no secrets).\n";
        commit_prompt += "2) If nothing to commit, set committed=false and explain in sha_or_reason.\n";
        commit_prompt += "3) Commit message: complete sentences, focus on why.\n";
        commit_prompt += "   Preferred subject: feat(df): " + item_id + " <short outcome>\n";
        commit_prompt += "4) Do NOT push. Do NOT amend published history.\n";
        commit_prompt += "5) Return committed, sha_or_reason (short SHA or reason), message.\n";

        let commit_r = agent(commit_prompt, #{
            label: item_id + ":commit",
            capability_mode: "all",
            output_schema: commit_schema,
        });

        if commit_r != () && commit_r.success && commit_r.output != () && commit_r.output.committed == true {
            log(item_id + " committed: " + commit_r.output.sha_or_reason);
        } else {
            log(item_id + " no commit (clean or skipped)");
        }
    }

    // ---- Mark done if acceptance met ----
    phase("Close-item");
    let close_prompt = "";
    close_prompt += hard_lines;
    close_prompt += "\nClose ROADMAP item " + item_id + " only if acceptance is honestly met.\n";
    close_prompt += "OUTCOME: " + outcome + "\n";
    close_prompt += "1) Re-read ROADMAP + plan acceptance for " + item_id + " and verify evidence in the tree.\n";
    close_prompt += "2) If met: set status to done; clear Engineering doing if this was the active item;\n";
    close_prompt += "   point Next session at the next DF todo (or DF06/release if last).\n";
    close_prompt += "3) If NOT met: leave as doing or todo with honest notes; marked_done=false.\n";
    close_prompt += "4) Return marked_done, notes, next_item_hint.\n";

    let close_r = agent(close_prompt, #{
        label: item_id + ":close",
        capability_mode: "all",
        output_schema: close_schema,
    });

    let marked = false;
    let next_hint = "";
    if close_r != () && close_r.success && close_r.output != () {
        if close_r.output.marked_done == true { marked = true; }
        if close_r.output.next_item_hint != () { next_hint = close_r.output.next_item_hint; }
    }

    results.push(#{
        item_id: item_id,
        implement_ok: true,
        marked_done: marked,
        open_bugs_final: open_bugs,
        blocking_final: blocking,
        next_item_hint: next_hint,
    });

    if !marked && stop_on_fail {
        log(item_id + " not marked done — stopping queue so a human can inspect");
        failed_items.push(item_id);
        complete(#{
            summary: "Stopped after " + item_id + " (not marked done)",
            completed: results,
            failed: failed_items,
            next: item_id,
            target_release: "4.5.0",
        });
    }

    // Optional human gate between items (resume continues to next)
    if await_between {
        phase("Gate");
        await_user("user", "DF item " + item_id + " closed (marked_done=" + marked.to_string() + "). Resume to continue the queue, or stop the run.");
    }
}

// ---- Final synthesis ----
phase("Synthesize");
let synth_prompt = "";
synth_prompt += hard_lines;
synth_prompt += "\nSummarize Phase DF queue run toward arkgate 4.5.0.\n";
synth_prompt += "Read ROADMAP Next session and Phase DF table statuses.\n";
synth_prompt += "Queue results JSON:\n";
synth_prompt += json_encode(results) + "\n";
synth_prompt += "Failed list:\n";
synth_prompt += json_encode(failed_items) + "\n";
synth_prompt += "Write a short markdown report via write_scratch if useful, and return clear prose:\n";
synth_prompt += "- which DF items are done\n";
synth_prompt += "- what remains for 4.5.0\n";
synth_prompt += "- whether DF06 publish steps remain (prepare vs publish)\n";
synth_prompt += "- recommended next human action\n";
synth_prompt += "Do not publish npm or push.\n";

let synth = agent(synth_prompt, #{
    label: "df-synthesize",
    capability_mode: "read-write",
});

let summary_text = "DF 4.5.0 queue finished";
if synth != () && synth.success && synth.output != () {
    summary_text = "DF 4.5.0 queue finished — see agent synthesis";
}

// Optional scratch report
let report_body = "";
report_body += "# Phase DF queue summary (4.5.0)\n\n";
report_body += "Items processed: " + queue.len().to_string() + "\n\n";
report_body += "```json\n";
report_body += json_encode(results);
report_body += "\n```\n\n";
report_body += "Failed: ";
report_body += json_encode(failed_items);
report_body += "\n";
let report_path = write_scratch_file("df-450-queue-summary.md", report_body);

complete(#{
    summary: summary_text,
    items: results,
    failed: failed_items,
    queue: queue,
    target_release: "4.5.0",
    report_path: report_path,
});
