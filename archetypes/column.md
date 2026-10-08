---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
draft: true
description: ""
---

<!-- Column (专栏): a series of articles.
     To add an article to this column, run `hugo new post/xxxx.md` and set
     in its front matter:  column: "{{ .File.ContentBaseName }}"
     Optionally set `weight: 1` on articles to control reading order
     (lower weight comes first; without weight, newest comes first). -->

Write the column introduction here.
