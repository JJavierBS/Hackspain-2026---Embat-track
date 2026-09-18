/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" runs the app on the synthetic data in src/mocks. */
  readonly VITE_MOCKS?: string;
}
