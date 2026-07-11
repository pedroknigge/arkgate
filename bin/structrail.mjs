#!/usr/bin/env node
import { runArkCli } from './ark.mjs';

process.exitCode = await runArkCli();
