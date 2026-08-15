# @ojaline/mobile — React Native

Sprint 0.1 FE-2 ticket. RN init is deferred here (requires the native toolchain + Android SDK to verify a full build).

Planned (ADR-000 §3):
- React Native, Android-first.
- Offline-first: MMKV + React Query persistence.
- Offline cart queue with reconnect re-validation (System Doc §15 — Phase 1 in-scope).

Do not hand-write RN config into this repo yet; use the framework CLI during the FE-2 ticket so the generated native projects stay canonical.
