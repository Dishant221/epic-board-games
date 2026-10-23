---
title: "How to play Sudoku: rules, pencil marks and your first grid"
description: "Learn Sudoku from scratch: the one rule, how rows, columns and boxes work, scanning, pencil marks, mistake checking and how to use hints wisely."
pubDate: 2026-09-22
game: sudoku
tags: ["sudoku", "rules", "puzzle", "beginners"]
hero: /blog/heroes/how-to-play-sudoku.png
heroAlt: "Illustrated hero image for How to play Sudoku: rules, pencil marks and your first grid"
---

Sudoku looks like a maths puzzle, but there is no arithmetic in it at all. The digits 1 to 9 are just nine different symbols; you could play with letters or fruit and nothing would change. What the puzzle really tests is patient, careful logic, and that is exactly why a finished grid feels so satisfying. This guide walks you through the single rule, the tools built into our Sudoku board, and the first techniques you need to finish an easy puzzle without guessing.

## What you need

Nothing but a few quiet minutes. Our Sudoku runs in the browser on a phone, tablet or desktop, and every puzzle is generated with a unique solution, so you never need to guess. Pick a difficulty from easy up to fiendish, tap **Play**, and the grid appears with some cells already filled. Those pre-filled digits are called **givens**; they never change, and the whole puzzle unfolds from them.

## The one rule

Every row, every column and every 3×3 box must contain the digits 1 to 9 exactly once. That is the entire rule set. A digit you place has to be legal in its row, its column and its box at the same time, and because each cell belongs to one of each, you are always checking three "houses" at once.

The grid is 9×9, giving 81 cells. The thick lines divide it into nine boxes of nine cells. Players usually number rows from top to bottom and columns from left to right, so "row 3, column 7" means the third row down and the seventh cell along.

## How the board works

- **Tap a cell, then tap a digit** on the number pad to fill it. Tap the same digit again or use the clear button to empty the cell.
- **Pencil mode** switches the pad to small candidate notes. In pencil mode, tapping a digit writes it in the corner of the cell instead of filling it. Jot every digit that could still go in a cell, and remove them as you rule them out.
- **Mistake checking** can be switched on so that any digit that contradicts the solution is highlighted. Leave it off if you want the traditional paper experience, or on while you are learning.
- **Hint** reveals one correct digit. It is powered by a real solver, so it never guesses either; it simply places a digit that follows logically from the current grid.
- Fill every cell correctly to win. The board tells you when the grid is complete.

## Your first technique: scanning

Beginners often stare at an empty cell and ask "what goes here?". Experienced solvers flip the question around and ask "where does the 7 go in this box?". That second question is called **scanning**, or cross-hatching, and it solves most easy puzzles on its own.

Pick a digit that already appears several times, say 7. Look at a box that has no 7 yet. Every row that already contains a 7 rules out three cells of that box; every column with a 7 rules out three more. Cross off the cells that already hold a given. If only one cell survives, the 7 belongs there. Then move on to the next box, and the next digit.

A good habit is to work through the digits 1 to 9 in order, then start again, because each placement opens up new eliminations somewhere else.

## Naked singles

The other beginner's technique is the **naked single**: a cell where only one digit is possible. Look at an empty cell, list the digits already present in its row, column and box, and see what is left. If eight digits are already taken, the ninth is forced.

Naked singles are easy to spot when a row or box is nearly full. On harder grids they hide, which is where pencil marks come in.

## When to use pencil marks

On easy puzzles you can usually get by without notes. From medium upward, write candidates into the cells you cannot immediately solve. Pencil marks turn an invisible deduction into a visible one: when a cell is down to a single small digit, it is a naked single; when a digit appears as a candidate in only one cell of a box, it is a hidden single.

Two tips keep notes useful rather than cluttered. First, do not pencil in every cell at once; add notes to a box when you are actively working on it. Second, keep them up to date. Each time you place a digit, clear it from the candidates in the same row, column and box.

## Using mistake checking as a teacher

Purists avoid mistake checking, but while you are learning it is a genuinely good tutor. Turn it on, make the placement you believe in, and if it lights up, stop and work out *why* it was wrong. Was a digit already in the column you forgot to scan? Did you misread the box boundary? Finding the flaw in your own reasoning teaches more than a correct guess ever will. Once a difficulty level feels comfortable, switch the checker off and trust your logic.

## Difficulty levels

Difficulty in Sudoku has nothing to do with how many givens there are. It depends on which techniques the puzzle demands:

- **Easy** puzzles fall to scanning and naked singles alone.
- **Medium** adds hidden singles and a few pencil-mark deductions.
- **Hard** expects pairs, triples and box-line reductions.
- **Fiendish** needs advanced patterns such as X-wings and chains. Our [Sudoku solving techniques guide](/blog/sudoku-solving-techniques) covers them in order.

## Common mistakes

- **Guessing.** A well-made puzzle never needs it. If you feel stuck, go back to scanning a different digit.
- **Forgetting the box.** A digit can be legal in its row and column yet already present in its box.
- **Stale pencil marks.** Placing a 4 and leaving the small 4s nearby leads to wrong "singles" later.
- **Tunnel vision.** Working on one corner for ten minutes while an obvious single waits on the other side of the grid.

## Playing with friends and family

Sudoku is a solo puzzle, but it is a surprisingly social one. A few ideas that work well on a shared screen or on two devices side by side:

- **Race the clock.** Pick the same difficulty and see who finishes first. Agree whether hints are allowed.
- **Pass the grid.** Take turns placing one digit each and explaining the logic out loud. It is the fastest way to teach a child or a grandparent.
- **Hint budget.** Give each player three hints for the evening and see who hoards them best.

## A little history

The modern puzzle appeared as "Number Place" in a US puzzle magazine in 1979, designed by Howard Garns. The Japanese publisher Nikoli picked it up in the mid-1980s and gave it the name Sudoku, roughly "the digits must be single". A New Zealander, Wayne Gould, wrote a computer program to generate puzzles and persuaded The Times in London to print one in November 2004. Within a year it was in newspapers around the world.

## Quick reference

| Topic | Summary |
| --- | --- |
| Grid | 9×9 cells in nine 3×3 boxes |
| Rule | Each row, column and box holds 1–9 exactly once |
| Fill a cell | Tap the cell, then a digit |
| Pencil marks | Toggle pencil mode, tap digits to note candidates |
| Mistake check | Optional highlight of digits that contradict the solution |
| Hint | Reveals one correct digit using the solver |
| Win | Every cell filled correctly |
| First techniques | Scanning (cross-hatching), naked singles |

## Image guide

![A Sudoku grid with one row highlighted in violet, one column in blue and one 3×3 box in amber, showing the three kinds of house every cell belongs to](/blog/sudoku-boxes.svg)

Every cell sits in exactly one row, one column and one box; a digit must be legal in all three at the same time.

![A Sudoku grid showing two 7s casting red bands across the top-left box, leaving a single green cell where the 7 must go](/blog/sudoku-scanning.svg)

Scanning in action: the existing 7s eliminate whole rows and a column inside the box, and the single remaining cell is the answer.

## References

- [Sudoku on Wikipedia](https://en.wikipedia.org/wiki/Sudoku)
- [Glossary of Sudoku terms](https://en.wikipedia.org/wiki/Glossary_of_Sudoku)
- [Howard Garns, creator of Number Place](https://en.wikipedia.org/wiki/Howard_Garns)
- [Nikoli, the publisher that named Sudoku](https://en.wikipedia.org/wiki/Nikoli_(publisher))

## Play it now

Ready to fill your first grid? Start on easy, switch on mistake checking and keep the pencil handy. [Play Sudoku now](/games/sudoku) — it is free and runs in your browser.
