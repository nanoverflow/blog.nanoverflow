---
title: Stash
build:
  list: never    # the section index itself: never listed, never rendered
  render: never  # (no /stash/ URL; only the child pages below are published)
cascade:
  build:
    list: never   # children excluded from .Site.RegularPages → home / search / RSS never show them
    render: always # child HTML pages are published, reachable by direct URL only
---
