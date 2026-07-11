#!/usr/bin/env node
import { runArkCli as runStructrailCli } from './ark.mjs';

process.exitCode = await runStructrailCli();
