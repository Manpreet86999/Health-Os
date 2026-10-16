import {defineConfig} from '@playwright/test';
import base from './playwright.chat-installed.config';
export default defineConfig({...base,testMatch:['intelligence-orchestrator.spec.ts'],outputDir:'output/intelligence-upgrade-orchestrator',reporter:'line'});
