/// <reference types="vite/client" />
import type { TestcatApi } from "@testcat/shared";

declare global {
  interface Window {
    testcat: TestcatApi;
  }
}
