---
description: Generate 3x5 sets of questions, prioritize, and prompt me
agent: plan
model: openrouter/deepseek/deepseek-chat-v3.1:free
---

Please start 3 "$ARGUMENTS" agents, provide each of them @FLARE_IDEA.md and @research/\*.md, and ask them each to come up with 5 questions. Have them assign each question a rank from "Priority 1: The project will fail if this question is not answered" to "Priority 5: Nice to know".

After you get the questions back, reduce them to unique questions, sort them by highest priority, and ask me the top 5 questions.
