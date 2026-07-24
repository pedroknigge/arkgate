// Pre-release field dogfood gauntlet for ArkGate (ArkRules v4 train).
//
// 1) Audit ROADMAP Phase AR claims against the tree (gaps, dead wiring, honesty).
// 2) Optionally fix library gaps in this repo (execute mode).
// 3) Clone a deterministic corpus of known TypeScript projects into a temp dir,
//    install/link local arkgate at maximum expression, and hunt product gaps.
// 4) Adversarially verify field findings; synthesize a release gate report.
// 5) Optionally apply high-confidence product fixes back in the library.
//
// Launch:
//   /workflow pre-release-field-dogfood
//   /workflow pre-release-field-dogfood {"mode":"full","max_targets":2,"fix_library":true}
//
// Args (all optional):
//   mode: "audit" | "dogfood" | "full"   (default "full")
//   max_targets: 1..3                    (default 2)
//   fix_library: true|false              (default false; set true to land library fixes)
//   apply_product_fixes: true|false      (default false; only after dogfood + verify)
//   corpus_offset: integer >= 0          (default 0; rotates which catalog slice is used)
//   work_root: string                    (default "/tmp/arkgate-pre-release-dogfood")
//   skip_cleanup: true|false             (default false)
//
// Determinism: corpus is a fixed catalog; "random" is corpus_offset rotation, never wall-clock RNG.

let meta = #{
    name: "pre-release-field-dogfood",
    description: "Audit ArkRules roadmap vs code, optionally fix gaps, dogfood max ArkGate on known TS repos in temp clones, verify findings, report release readiness",
    when_to_use: "Before every arkgate release (especially 4.x / Phase AR); anytime you need field proof that write-path sensors, inventory, and brownfield adopt work on real codebases",
    phases: [
        #{ title: "Roadmap-audit", detail: "compare ROADMAP AR claims to tree and write-path wiring" },
        #{ title: "Library-fix", detail: "optional: close verified library gaps" },
        #{ title: "Field-dogfood", detail: "temp-clone known TS projects and adopt ArkGate max" },
        #{ title: "Verify", detail: "adversarial check of field findings" },
        #{ title: "Synthesize", detail: "release gate report + optional product fixes" },
    ],
};

// --- schemas ---

let gaps_schema = #{
    "type": "object",
    "required": ["gaps", "summary", "ready_for_dogfood"],
    "properties": #{
        "summary": #{ "type": "string" },
        "ready_for_dogfood": #{ "type": "boolean" },
        "version_note": #{ "type": "string" },
        "gaps": #{
            "type": "array",
            "maxItems": 16,
            "items": #{
                "type": "object",
                "required": ["id", "severity", "area", "evidence", "fix_intent"],
                "properties": #{
                    "id": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "area": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                    "fix_intent": #{ "type": "string" },
                    "auto_safe": #{ "type": "boolean" },
                },
            },
        },
    },
};

let fix_schema = #{
    "type": "object",
    "required": ["fixed", "skipped", "notes"],
    "properties": #{
        "fixed": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["id", "files", "what"],
                "properties": #{
                    "id": #{ "type": "string" },
                    "files": #{ "type": "array", "items": #{ "type": "string" } },
                    "what": #{ "type": "string" },
                },
            },
        },
        "skipped": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["id", "reason"],
                "properties": #{
                    "id": #{ "type": "string" },
                    "reason": #{ "type": "string" },
                },
            },
        },
        "notes": #{ "type": "string" },
        "tests_run": #{ "type": "string" },
    },
};

let dogfood_schema = #{
    "type": "object",
    "required": ["target_id", "repo", "clone_path", "findings", "adoption_summary"],
    "properties": #{
        "target_id": #{ "type": "string" },
        "repo": #{ "type": "string" },
        "clone_path": #{ "type": "string" },
        "adoption_summary": #{ "type": "string" },
        "ark_check_exit": #{ "type": "string" },
        "commands_run": #{
            "type": "array",
            "maxItems": 20,
            "items": #{ "type": "string" },
        },
        "findings": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["kind", "severity", "title", "evidence", "product_fix"],
                "properties": #{
                    "kind": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "title": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                    "product_fix": #{ "type": "string" },
                },
            },
        },
        "cleanup_done": #{ "type": "boolean" },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["real", "reason", "evidence"],
    "properties": #{
        "real": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
        "title": #{ "type": "string" },
    },
};

let report_schema = #{
    "type": "object",
    "required": ["title", "release_verdict", "markdown", "blocker_count", "next_actions"],
    "properties": #{
        "title": #{ "type": "string" },
        "release_verdict": #{ "type": "string" },
        "blocker_count": #{ "type": "integer" },
        "markdown": #{ "type": "string" },
        "next_actions": #{
            "type": "array",
            "maxItems": 10,
            "items": #{ "type": "string" },
        },
        "confirmed_field_findings": #{ "type": "integer" },
        "library_gaps_remaining": #{ "type": "integer" },
    },
};

// --- args ---

let mode = "full";
let max_targets = 2;
let fix_library = false;
let apply_product_fixes = false;
let corpus_offset = 0;
let work_root = "/tmp/arkgate-pre-release-dogfood";
let skip_cleanup = false;

if args != () {
    if args.mode != () { mode = args.mode; }
    if args.max_targets != () { max_targets = args.max_targets; }
    if args.fix_library != () { fix_library = args.fix_library; }
    if args.apply_product_fixes != () { apply_product_fixes = args.apply_product_fixes; }
    if args.corpus_offset != () { corpus_offset = args.corpus_offset; }
    if args.work_root != () { work_root = args.work_root; }
    if args.skip_cleanup != () { skip_cleanup = args.skip_cleanup; }
}

if max_targets < 1 { max_targets = 1; }
if max_targets > 3 { max_targets = 3; }
if corpus_offset < 0 { corpus_offset = 0; }

// Fixed catalog of known TypeScript / Node projects suitable for brownfield adopt.
// Selection is deterministic via corpus_offset (not RNG).
let catalog = [
    #{
        id: "nestjs-sample",
        repo: "https://github.com/nestjs/typescript-starter.git",
        depth: "1",
        note: "NestJS starter — FrameworkAdapters / hexagonal pressure",
        max_expression: "start/api archetype, DomainModel+Application arkrules advisory, doctor, rules-inventory",
    },
    #{
        id: "express-generator-style",
        repo: "https://github.com/expressjs/express.git",
        depth: "1",
        note: "Classic Express — brownfield spaghetti residual, baseline freeze path",
        max_expression: "brownfield adopt, baseline honesty, inventory, thin-adapter advisory",
    },
    #{
        id: "typeorm-sample",
        repo: "https://github.com/typeorm/typescript-example.git",
        depth: "1",
        note: "TypeORM example — PersistenceAdapters / anemic model pressure",
        max_expression: "layer map + arkrules DomainModel + inventory",
    },
    #{
        id: "tsoa-example",
        repo: "https://github.com/lukeautry/tsoa.git",
        depth: "1",
        note: "tsoa monorepo-ish — include/exclude + multi-package stress",
        max_expression: "include/exclude honesty, doctor dual health, compact MCP",
    },
    #{
        id: "fastify-demo",
        repo: "https://github.com/fastify/demo.git",
        depth: "1",
        note: "Fastify demo — ApplicationOrchestration / presentation adapters",
        max_expression: "full start path, arkrules templates, ark-check --rules-inventory",
    },
    #{
        id: "clean-architecture-ts",
        repo: "https://github.com/jbuget/nodejs-clean-architecture-app.git",
        depth: "1",
        note: "Clean architecture sample — good ArkRules structural sensor target",
        max_expression: "DomainModel arkrules enforced pilot + invariant catalog advisory",
    },
];

// Slice catalog deterministically
let targets = [];
let cat_len = catalog.len();
let i = 0;
while i < max_targets {
    let idx = corpus_offset + i;
    // wrap without % if large: subtract multiples
    while idx >= cat_len {
        idx = idx - cat_len;
    }
    targets.push(catalog[idx]);
    i += 1;
}

let do_audit = true;
let do_dogfood = true;
if mode == "audit" {
    do_dogfood = false;
}
if mode == "dogfood" {
    // still audit lightly so dogfood agents know claimed surface
    do_audit = true;
}

// ============================================================================
// Phase 1 — Roadmap audit
// ============================================================================
phase("Roadmap-audit");
log("Auditing Phase AR / ArkRules roadmap claims against this library tree");

let audit_prompt = "";
audit_prompt += "You are auditing the ArkGate library (this repo) before release.\n";
audit_prompt += "Use tools: read_file, grep, run_terminal_command (read-only style: git status, rg, npm test subsets).\n";
audit_prompt += "Do NOT invent claims. Every gap needs a file path or command output as evidence.\n\n";
audit_prompt += "Read first:\n";
audit_prompt += "- ROADMAP.md (Phase AR table AR01-AR19 and Next implementation session)\n";
audit_prompt += "- docs/plans/arkrules-evolution/README.md\n";
audit_prompt += "- package.json version and exports (runtime/nestjs removed?)\n";
audit_prompt += "- src/kernel/resolvedAnalysis.ts (arkrules sensors + invariant coverage path)\n";
audit_prompt += "- bin/lib/resolved-candidate-facts.mjs (classShapes production)\n";
audit_prompt += "- bin/lib/architecture-scan.mjs (effective contract + coverageInputs)\n";
audit_prompt += "- bin/lib/rules-under-contract.mjs (doctor honesty)\n";
audit_prompt += "- src/domain/policyDelta.ts (promotion refuse)\n";
audit_prompt += "- bin/ark-check-runtime.mjs for --rules-inventory\n";
audit_prompt += "- bin/ark-mcp-runtime.mjs for ark_rules_inventory\n\n";
audit_prompt += "Gap checklist (severity high|medium|low):\n";
audit_prompt += "1. ROADMAP marks AR done but code/wiring missing\n";
audit_prompt += "2. Dead write path (sensors without facts production)\n";
audit_prompt += "3. Doctor/HTML false green or empty stubs\n";
audit_prompt += "4. package version vs breaking (AR04 needs 4.0.0)\n";
audit_prompt += "5. Tests missing for claimed surface\n";
audit_prompt += "6. fileHints / orchestration-only / thin-adapter not wired\n";
audit_prompt += "7. Docs claim more than clean-checkout can prove\n";
audit_prompt += "8. Performance/size risk for PreToolUse\n\n";
audit_prompt += "Set ready_for_dogfood=true only if foundations load (schema, effective contract) work and absence of arkRules is still byte-for-byte safe.\n";
audit_prompt += "auto_safe=true only for mechanical wiring/docs that cannot weaken the gate.\n";
audit_prompt += "Empty gaps[] only after reading the listed files.\n";

let audit = agent(audit_prompt, #{
    label: "roadmap-audit",
    capability_mode: "execute",
    output_schema: gaps_schema,
});

let gaps = [];
let ready_for_dogfood = true;
let audit_summary = "Audit agent failed; treating as not ready without evidence.";
let version_note = "";

if audit != () && audit.success && audit.output != () {
    if audit.output.gaps != () {
        gaps = audit.output.gaps;
    }
    if audit.output.ready_for_dogfood != () {
        ready_for_dogfood = audit.output.ready_for_dogfood;
    }
    if audit.output.summary != () {
        audit_summary = audit.output.summary;
    }
    if audit.output.version_note != () {
        version_note = audit.output.version_note;
    }
} else {
    ready_for_dogfood = false;
    log("Roadmap audit agent failed or returned no schema — fail closed for release confidence");
}

log("Audit: " + gaps.len().to_string() + " gaps; ready_for_dogfood=" + ready_for_dogfood.to_string());

// ============================================================================
// Phase 2 — Library fix (optional)
// ============================================================================
phase("Library-fix");
let fix_result = #{ fixed: [], skipped: [], notes: "skipped", tests_run: "" };

if fix_library == true && gaps.len() > 0 {
    log("fix_library=true — applying auto_safe / high gaps only");
    let gaps_json = json_encode(gaps);
    let fix_prompt = "";
    fix_prompt += "You are fixing ArkGate library gaps before release dogfood.\n";
    fix_prompt += "Working tree is the arkgate mother repo. Use read_file, search_replace, run_terminal_command.\n";
    fix_prompt += "Hard lines: binary gate; no LLM pass/fail; no new skill names; no codemod engine;\n";
    fix_prompt += "no weaken ark.config; Domain pure modules may need generate:cli-pure / generate:analysis-engine after edit.\n";
    fix_prompt += "Prefer wiring + tests. Do NOT bump package version unless gap is explicitly version-vs-breaking and user intent is clear — prefer document in notes.\n";
    fix_prompt += "Only fix gaps with auto_safe=true OR severity=high with concrete evidence path.\n";
    fix_prompt += "After edits: npm run generate:cli-pure (if domain pure changed), generate:analysis-engine if needed,\n";
    fix_prompt += "and run focused vitest for touched domains. Do not run full test:confidence unless quick.\n";
    fix_prompt += "Gaps JSON:\n";
    fix_prompt += gaps_json;
    fix_prompt += "\nReturn fixed[] and skipped[] with reasons.\n";

    let fix_agent = agent(fix_prompt, #{
        label: "library-fix",
        capability_mode: "all",
        output_schema: fix_schema,
    });
    if fix_agent != () && fix_agent.success && fix_agent.output != () {
        fix_result = fix_agent.output;
    } else {
        fix_result = #{ fixed: [], skipped: [], notes: "library-fix agent failed", tests_run: "" };
    }
} else {
    if fix_library == false {
        log("fix_library=false — skipping library edits (set args.fix_library=true to enable)");
        fix_result = #{ fixed: [], skipped: [], notes: "fix_library disabled", tests_run: "" };
    } else {
        log("No gaps reported — nothing to fix");
        fix_result = #{ fixed: [], skipped: [], notes: "no gaps", tests_run: "" };
    }
}

// ============================================================================
// Phase 3 — Field dogfood (temp clones)
// ============================================================================
phase("Field-dogfood");
let dogfood_results = [];

if do_dogfood == false {
    log("mode=audit — skipping field dogfood");
} else if ready_for_dogfood == false {
    log("Audit not ready_for_dogfood — still running dogfood to surface product pain, but release verdict will stay blocked");
}

if do_dogfood == true {
    let djobs = [];
    let ti = 0;
    while ti < targets.len() {
        let t = targets[ti];
        let clone_path = work_root + "/" + t.id;
        let t_json = json_encode(t);

        let dprompt = "";
        dprompt += "FIELD DOGFOOD — temporary clone only. Never push. Never modify the arkgate mother repo unless you must fix a product bug discovered here (prefer report, do not fix mother unless critical crash).\n\n";
        dprompt += "Target JSON:\n";
        dprompt += t_json;
        dprompt += "\n\nWork root base: ";
        dprompt += work_root;
        dprompt += "\nClone path MUST be: ";
        dprompt += clone_path;
        dprompt += "\n\nProcedure (use run_terminal_command; set long timeouts for clone/npm):\n";
        dprompt += "1) mkdir -p work root; rm -rf clone_path if exists; git clone --depth ";
        dprompt += t.depth;
        dprompt += " repo into clone_path.\n";
        dprompt += "2) Detect package manager (package-lock / pnpm-lock / yarn.lock). Install deps if feasible; if install fails, still try arkgate file-level setup and record finding.\n";
        dprompt += "3) Locate mother arkgate root via git rev-parse in the CURRENT workspace (not the clone). Prefer linking:\n";
        dprompt += "   - npm pack from mother OR file: dependency OR npx node mother/bin/ark.mjs\n";
        dprompt += "   Prefer: node <mother>/bin/ark.mjs and node <mother>/bin/ark-check.mjs so you test THIS branch.\n";
        dprompt += "4) MAXIMUM expression adoption (do as much as the tree allows):\n";
        dprompt += "   a) ark start / init appropriate archetype if JS/TS app (or hand-write ark.config.json layers matching real dirs)\n";
        dprompt += "   b) arkRules map + arkrules/*.json from templates (DomainModel at least) advisory first\n";
        dprompt += "   c) node mother/bin/ark-check.mjs --json and doctor surfaces\n";
        dprompt += "   d) --rules-inventory --json if available\n";
        dprompt += "   e) optional: MCP not required; CLI is enough\n";
        dprompt += "   f) Try promoting one structure rule only if coverage allows; never silent weaken\n";
        dprompt += "5) Capture findings: product bugs, DX friction, false green, crash, confusing remediation, missing sensor fire, inventory noise, size/latency fear, docs lie.\n";
        dprompt += "   kind: product-bug | dx-friction | false-green | crash | docs-lie | sensor-miss | inventory-noise | other\n";
        dprompt += "   severity: high | medium | low\n";
        dprompt += "   product_fix: concrete change in mother arkgate (file + intent)\n";
        dprompt += "6) CLEANUP: unless skip_cleanup=";
        dprompt += skip_cleanup.to_string();
        dprompt += ", rm -rf the clone_path after collecting evidence. Set cleanup_done accordingly.\n";
        dprompt += "7) Return structured output. Empty findings[] only if adopt fully succeeded and you inspected doctor/check output.\n";
        dprompt += "Hard rules: no credentials; no force-push; no npm publish; stay inside work_root for clones.\n";

        djobs.push(#{
            prompt: dprompt,
            label: "dogfood:" + t.id,
            capability_mode: "all",
            output_schema: dogfood_schema,
        });
        ti += 1;
    }

    log("Dogfooding " + djobs.len().to_string() + " targets under " + work_root);
    let dresults = parallel(djobs);
    let di = 0;
    while di < dresults.len() {
        let r = dresults[di];
        if r != () && r.success && r.output != () {
            dogfood_results.push(r.output);
        } else {
            // fail closed: record a synthetic high finding for the panel slot
            let t = targets[di];
            dogfood_results.push(#{
                target_id: t.id,
                repo: t.repo,
                clone_path: work_root + "/" + t.id,
                adoption_summary: "dogfood agent failed or returned no schema",
                ark_check_exit: "unknown",
                commands_run: [],
                findings: [
                    #{
                        kind: "crash",
                        severity: "high",
                        title: "Dogfood agent failed for " + t.id,
                        evidence: "parallel slot success=false or empty output",
                        product_fix: "Investigate dogfood agent reliability; ensure clone timeouts and package manager detection",
                    },
                ],
                cleanup_done: false,
            });
        }
        di += 1;
    }
}

// Flatten field findings for verification (cap 12)
let field_findings = [];
for dr in dogfood_results {
    if dr.findings != () {
        for f in dr.findings {
            if field_findings.len() < 12 {
                // attach repo context into title for verify prompt
                let enriched = #{
                    kind: f.kind,
                    severity: f.severity,
                    title: "[" + dr.target_id + "] " + f.title,
                    evidence: f.evidence,
                    product_fix: f.product_fix,
                    target_id: dr.target_id,
                    clone_path: dr.clone_path,
                };
                field_findings.push(enriched);
            }
        }
    }
}
if field_findings.len() >= 12 {
    log("Field findings truncated to 12 for verify budget");
}

// ============================================================================
// Phase 4 — Adversarial verify
// ============================================================================
phase("Verify");
let confirmed = [];
let verify_attempted = 0;

if field_findings.len() == 0 {
    log("No field findings to verify");
} else {
    let vjobs = [];
    for f in field_findings {
        let f_json = json_encode(f);
        let vprompt = "";
        vprompt += "Adversarially verify this field dogfood finding about ArkGate product quality.\n";
        vprompt += "Default real=false unless you independently inspect mother-repo code or leftover evidence.\n";
        vprompt += "Use read_file/grep on the MOTHER arkgate repo (workspace). Clone may already be deleted.\n";
        vprompt += "Finding JSON:\n";
        vprompt += f_json;
        vprompt += "\nSet real=true only with concrete evidence (file:line, command output you re-ran, or clear product contract contradiction).\n";
        vprompt += "title should echo the finding title.\n";
        vjobs.push(#{
            prompt: vprompt,
            label: "verify-field",
            capability_mode: "execute",
            output_schema: verdict_schema,
        });
    }
    verify_attempted = vjobs.len();
    let verdicts = parallel(vjobs);
    let vi = 0;
    while vi < verdicts.len() {
        let v = verdicts[vi];
        if v != () && v.success && v.output != () && v.output.real == true {
            if v.output.evidence != () && v.output.evidence != "" {
                confirmed.push(#{
                    finding: field_findings[vi],
                    reason: v.output.reason,
                    evidence: v.output.evidence,
                });
            }
        }
        vi += 1;
    }
    log(confirmed.len().to_string() + "/" + verify_attempted.to_string() + " field findings survived verification");
}

// ============================================================================
// Phase 5 — Synthesize + optional product fixes
// ============================================================================
phase("Synthesize");

if apply_product_fixes == true && confirmed.len() > 0 {
    log("apply_product_fixes=true — landing high-severity confirmed product fixes");
    let conf_json = json_encode(confirmed);
    let pfix_prompt = "";
    pfix_prompt += "Apply ONLY high-severity confirmed field findings to the ArkGate mother repo.\n";
    pfix_prompt += "Hard lines: no gate weaken; no new skill names; no codemod engine; regenerate pure CLI if Domain changes.\n";
    pfix_prompt += "Skip DX taste pure docs unless one-line honesty fix. Prefer code wiring + tests.\n";
    pfix_prompt += "Confirmed findings JSON:\n";
    pfix_prompt += conf_json;
    pfix_prompt += "\nReturn fixed/skipped via the fix schema.\n";
    let pfix = agent(pfix_prompt, #{
        label: "product-fix",
        capability_mode: "all",
        output_schema: fix_schema,
    });
    if pfix != () && pfix.success && pfix.output != () {
        // fold into fix_result notes
        let more = pfix.output;
        log("Product-fix notes: " + more.notes);
    }
} else {
    log("Product fixes not applied (set apply_product_fixes=true to enable after verify)");
}

// Report synthesis
let synth_payload = #{
    audit_summary: audit_summary,
    version_note: version_note,
    gaps: gaps,
    fix_result: fix_result,
    dogfood_results: dogfood_results,
    confirmed: confirmed,
    mode: mode,
    ready_for_dogfood: ready_for_dogfood,
    targets: targets,
};

let synth_json = json_encode(synth_payload);
let synth_prompt = "";
synth_prompt += "Write the ArkGate PRE-RELEASE FIELD DOGFOOD gate report as structured JSON including a long markdown field.\n";
synth_prompt += "Inputs (JSON):\n";
synth_prompt += synth_json;
synth_prompt += "\n\nRules for release_verdict:\n";
synth_prompt += "- block: any high confirmed field finding, or high library gap remaining, or package version still 3.x with AR04 breaking shipped, or audit not ready and mode was full\n";
synth_prompt += "- caution: only medium findings remain\n";
synth_prompt += "- ship-ok: no high confirmed issues and version/train story is honest\n";
synth_prompt += "Markdown must include: Executive summary, Library gaps, Field matrix (per target), Confirmed findings, Cleanup status, Next actions, What was NOT tested.\n";
synth_prompt += "blocker_count = number of high severity confirmed findings + high library gaps still open.\n";
synth_prompt += "Be brutally honest. Prefer ship-ok only with evidence.\n";

let report_agent = agent(synth_prompt, #{
    label: "synthesize-report",
    capability_mode: "read-only",
    output_schema: report_schema,
});

let title = "ArkGate pre-release field dogfood";
let release_verdict = "block";
let markdown = "# Pre-release field dogfood\n\nReport agent failed.\n";
let blocker_count = 1;
let next_actions = ["Re-run workflow after fixing synthesize agent", "Inspect /workflows journal"];
let confirmed_field_findings = confirmed.len();
let library_gaps_remaining = gaps.len();

if report_agent != () && report_agent.success && report_agent.output != () {
    let o = report_agent.output;
    if o.title != () { title = o.title; }
    if o.release_verdict != () { release_verdict = o.release_verdict; }
    if o.markdown != () { markdown = o.markdown; }
    if o.blocker_count != () { blocker_count = o.blocker_count; }
    if o.next_actions != () { next_actions = o.next_actions; }
    if o.confirmed_field_findings != () { confirmed_field_findings = o.confirmed_field_findings; }
    if o.library_gaps_remaining != () { library_gaps_remaining = o.library_gaps_remaining; }
}

// Fail closed if synthesize failed but we had high signals
if report_agent == () || report_agent.success == false {
    release_verdict = "block";
    blocker_count = blocker_count + 1;
}

let path = write_scratch_file("pre-release-field-dogfood-report.md", markdown);
log("Report written: " + path + " | verdict=" + release_verdict + " blockers=" + blocker_count.to_string());

complete(#{
    path: path,
    title: title,
    release_verdict: release_verdict,
    blocker_count: blocker_count,
    confirmed_field_findings: confirmed_field_findings,
    library_gaps_remaining: library_gaps_remaining,
    next_actions: next_actions,
    mode: mode,
    targets_run: targets.len(),
    work_root: work_root,
});
