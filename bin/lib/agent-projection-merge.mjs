// GENERATED FILE — do not edit by hand. Canonical: src/domain/agentProjectionMerge.ts -> bin/lib/agent-projection-merge.mjs; regenerate: npm run generate:cli-pure
import{agentProjectionContentIdentity as g,ensureTrailingNewline as u,normalizeNewlines as f,safeVersion as m}from"./agent-projection-formatters.mjs";const p=/<!--\s*arkgate:agent-projection:begin\b([^>]*)-->/i,k=/<!--\s*arkgate:agent-projection:end\s*-->/i,E=/\barkgateVersion=([A-Za-z0-9._+-]+)/i,h=/\bschema=([A-Za-z0-9._+-]+)/i;function x(o){const n=f(o??""),e=p.exec(n);if(!e)return{block:null,body:null,before:n,after:"",beginAttrs:null};const i=e.index,a=i+e[0].length,t=n.slice(a),r=k.exec(t);if(!r)return{block:null,body:null,before:n,after:"",beginAttrs:null};const c=r.index,l=c+r[0].length;let s=t.slice(0,c);s.startsWith(`
`)&&(s=s.slice(1));const d=n.slice(i,a+l),b=t.slice(l);return{block:d,body:s,before:n.slice(0,i),after:b,beginAttrs:e[1]??""}}function A(o){const n=String(o??""),i=p.exec(n)?.[1]??n,a=E.exec(i),t=h.exec(i),r=/\bnonAuthoritative\s*=\s*true\b/i.test(i);return{arkgateVersion:a?.[1]??null,schemaVersion:t?.[1]??null,nonAuthoritative:r}}function B(o,n){const e=A(o).arkgateVersion;return e?e===m(n):!1}function $(o){return String(o??"").includes("non-authoritative")}function I(o,n){const e=u(f(n)),a=x(e).body??e.replace(p,"").replace(k,"").trim()+`
`,t=g(a);if(o==null||!String(o).trim())return{content:u(`# Ark Enforcement

${e}`),action:"created",previousBlock:null,contentIdentity:t,preservedOutsideBlock:!1};const r=f(o),c=x(r);if(c.block!=null){const s=c.body??"";if(g(s)===t)return{content:u(r),action:"unchanged",previousBlock:c.block,contentIdentity:t,preservedOutsideBlock:!0};const d=c.before.replace(/\s*$/,`

`),b=c.after.replace(/^\s*/,`
`);return{content:u(`${d}${e.trimEnd()}
${b}`),action:"block-replaced",previousBlock:c.block,contentIdentity:t,preservedOutsideBlock:!0}}const l=/^(#\s+[^\n]*\n)/m.exec(r);if(l&&l.index!=null){const s=l.index+l[1].length,d=r.slice(0,s).replace(/\s*$/,`

`),b=r.slice(s).replace(/^\s*/,`
`);return{content:u(`${d}${e.trimEnd()}
${b}`),action:"block-inserted",previousBlock:null,contentIdentity:t,preservedOutsideBlock:!0}}return{content:u(`${e.trimEnd()}

${r.trimStart()}`),action:"block-inserted",previousBlock:null,contentIdentity:t,preservedOutsideBlock:!0}}export{x as extractAgentProjectionBlock,I as mergeAgentProjectionDocument,A as parseAgentProjectionStamp,$ as projectionHasNonEnforcementLabel,B as projectionMatchesPackageVersion};
