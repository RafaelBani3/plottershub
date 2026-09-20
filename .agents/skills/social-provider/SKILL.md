---
description: Build isolated provider adapters for TikTok, Instagram and
  YouTube.
name: social-provider
---

# Social Provider

Every provider should implement a consistent internal contract while
retaining provider-specific behavior.

Separate: - OAuth - profile - content listing - metrics - comments -
publishing - capability detection

Map provider errors to stable internal error codes.
