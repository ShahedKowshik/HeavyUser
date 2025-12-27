---
description: Push changes to git with a detailed summary in the commit message
---

Use this workflow to stage, commit, and push changes while ensuring a detailed summary is included for collaborators.

1. Update `CHANGELOG.md` with the latest changes
`Update /Users/kowshik/Vibe Coding/heavyuser/CHANGELOG.md`

2. Stage all changes
// turbo
`git add .`

3. Commit with a detailed, multi-line summary of what changed
`git commit -m "[SUMMARY]"`

4. Push to the remote branch
// turbo
`git push origin main`
